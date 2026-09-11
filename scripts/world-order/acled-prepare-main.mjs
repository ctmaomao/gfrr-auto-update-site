import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ACLED_CONFIG_PATHS } from './acled-publish-guard.mjs';

const split = value => value.split('\0').filter(Boolean);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, args, options = {}) => execFileSync('git', args, {
  cwd, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'], ...options
});
const cleanHash = (root, file, bytes) => git(root, ['hash-object', `--path=${file}`, '--stdin'], {
  input: bytes, stdio: ['pipe', 'pipe', 'pipe']
}).trim();

function optionalRef(root, ref) {
  try { return git(root, ['rev-parse', '--verify', ref]).trim(); }
  catch (error) { if (error.status === 128) return null; throw error; }
}

function assertIdle(root) {
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const file = path.resolve(root, git(root, ['rev-parse', '--git-path', marker]).trim());
    if (fs.existsSync(file)) throw new Error(`Git 操作未完成：${root} (${marker})`);
  }
}

function sourceChanges(root) {
  assertIdle(root);
  if (git(root, ['diff', '--cached', '--name-only', '-z'])) {
    throw new Error('暂存区非空：请先完成或取消暂存，自动发布不会改动已有暂存内容。');
  }
  const unknown = split(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  const dirty = split(git(root, ['diff', '--name-only', '-z']));
  const unrelated = [...unknown, ...dirty.filter(file => !ACLED_CONFIG_PATHS.includes(file))];
  if (unrelated.length) throw new Error(`存在无关改动或未跟踪文件：${unrelated.join(', ')}`);
  for (const file of dirty) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || !fs.lstatSync(full).isFile()) {
      throw new Error(`ACLED 配置删除或不是普通文件：${file}`);
    }
  }
  return dirty;
}

function inspect(root, checkRemote = true) {
  const branch = git(root, ['branch', '--show-current']).trim();
  if (!branch) throw new Error('当前为 detached HEAD；请先切回有名称的工作分支。');
  const dirty = sourceChanges(root);
  const remote = optionalRef(root, 'refs/remotes/origin/main');
  if (checkRemote && !remote) throw new Error('缺少 origin/main；请先确认仓库的 origin 配置并 fetch。');
  const main = optionalRef(root, 'refs/heads/main');
  const readyOnMain = !!remote && ['acled-prepare-main.mjs', 'acled-publish-auto.mjs'].every(file =>
    optionalRef(root, `origin/main:scripts/world-order/${file}`));
  const worktrees = git(root, ['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean).map(record => {
    const fields = record.split('\0');
    return {
      path: fields.find(field => field.startsWith('worktree '))?.slice(9),
      branch: fields.find(field => field.startsWith('branch '))?.slice(7),
      locked: fields.some(field => field === 'locked' || field.startsWith('locked '))
    };
  });
  const owner = worktrees.find(item => item.branch === 'refs/heads/main');
  const otherMain = owner && path.relative(fs.realpathSync(owner.path), root) !== '' ? owner.path : null;
  if (otherMain) {
    if (owner.locked) throw new Error(`main 工作目录被锁定，保持原状：${otherMain}`);
    assertIdle(otherMain);
    if (git(otherMain, ['status', '--porcelain', '-z'])) {
      throw new Error(`main 所在工作目录有改动，保持原状：${otherMain}`);
    }
  }
  if (checkRemote && main && Number(git(root, ['rev-list', '--count', 'origin/main..main']).trim()) !== 0) {
    throw new Error('本地 main 有未推送或分叉提交；不会把它们自动发布。');
  }
  if (main) {
    const upstream = git(root, ['for-each-ref', '--format=%(upstream:short)', 'refs/heads/main']).trim();
    if (upstream && upstream !== 'origin/main') throw new Error(`main 跟踪了其它上游：${upstream}`);
  }
  // Do not merge an operator's aggregate with a concurrently changed aggregate.
  for (const file of checkRemote ? dirty : []) {
    if (git(root, ['rev-parse', `HEAD:${file}`]).trim() !== git(root, ['rev-parse', `origin/main:${file}`]).trim()) {
      throw new Error(`远端配置已变化或当前分支基线不同：${file}；请先核对，配置未移动。`);
    }
  }
  return { branch, dirty, remote, main, otherMain, readyOnMain };
}

export function acquireAcledPublishLock(root) {
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim());
  const lock = path.join(common, 'acled-publish-auto.lock');
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`已有自动发布在运行或上次异常退出，请先核对：${lock}`);
    throw error;
  }
  // Remove only this invocation's empty lock directory, never repository files.
  return () => fs.rmdirSync(lock);
}

export function prepareAcledMain({ root, dryRun = false, log = console.log }) {
  root = fs.realpathSync(root);
  let state = inspect(root, dryRun);
  if (!dryRun) {
    git(root, ['fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
    state = inspect(root); // Fresh remote history and working-tree checks before any switch.
  }
  const plan = {
    dryRun, sourceBranch: state.branch, targetBranch: 'main', targetRef: 'origin/main',
    remoteCommit: state.remote, configFiles: state.dirty,
    releaseCleanMainWorktree: state.otherMain,
    featureCommitsMerged: false, readyOnMain: state.readyOnMain
  };
  log(JSON.stringify(plan, null, 2));
  if (dryRun) {
    log('预演完成：仅使用本地远端引用；没有 fetch、切换、文件写入、push 或 workflow 调用。');
    if (!state.readyOnMain) log('正式运行尚未就绪：自动发布入口尚未合入 origin/main；请先完成工具修复的审阅和集成。');
    return plan;
  }
  if (!state.readyOnMain) throw new Error('自动发布入口尚未合入 origin/main；请先完成工具修复的审阅和集成，尚未切换或发布。');

  let stash = null;
  let backup = null;
  const originals = new Map(state.dirty.map(file => [file, fs.readFileSync(path.join(root, file))]));
  try {
    if (originals.size) {
      const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim());
      const id = randomUUID();
      backup = path.join(common, 'acled-publish-backups', id);
      fs.mkdirSync(backup, { recursive: true });
      const manifest = { branch: state.branch, head: git(root, ['rev-parse', 'HEAD']).trim(), files: [] };
      for (const [file, bytes] of originals) {
        const target = path.join(backup, path.basename(file));
        fs.writeFileSync(target, bytes, { flag: 'wx' });
        if (!fs.readFileSync(target).equals(bytes)) throw new Error(`备份校验失败：${file}`);
        manifest.files.push({ file, backupFile: path.basename(file), sha256: digest(bytes) });
      }
      fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));
      log(`已验证配置备份：${backup}`);
      const previousStash = optionalRef(root, 'refs/stash');
      git(root, ['stash', 'push', '-m', `acled-publish-auto ${id}`, '--', ...state.dirty]);
      stash = optionalRef(root, 'refs/stash');
      if (!stash || stash === previousStash) throw new Error('未确认新的配置 stash，停止切换。');
      for (const [file, bytes] of originals) {
        if (git(root, ['rev-parse', `${stash}:${file}`]).trim() !== cleanHash(root, file, bytes)) {
          throw new Error(`stash 内容校验失败：${file}`);
        }
      }
      log(`配置 stash 已保留：${stash}`);
    }
    if (git(root, ['status', '--porcelain', '-z'])) throw new Error('切换前工作目录不干净，停止。');
    if (state.otherMain) {
      assertIdle(state.otherMain);
      if (git(state.otherMain, ['status', '--porcelain', '-z'])) throw new Error('main 工作目录在检查后发生了改动。');
      git(state.otherMain, ['switch', '--no-overwrite-ignore', '--detach']);
      log(`已保留旧 main 工作目录和原提交，以 detached HEAD 释放分支：${state.otherMain}`);
    }
    if (state.branch !== 'main') {
      git(root, state.main ? ['switch', '--no-overwrite-ignore', 'main'] : ['switch', '--no-overwrite-ignore', '--create', 'main', '--track', 'origin/main']);
    }
    git(root, ['merge', '--ff-only', '--no-overwrite-ignore', 'origin/main']);
    git(root, ['branch', '--set-upstream-to=origin/main', 'main']);
    if (stash) {
      git(root, ['stash', 'apply', stash]); // Retain the stash for recovery, including on conflict.
      for (const [file, bytes] of originals) {
        const full = path.join(root, file);
        if (!fs.lstatSync(full).isFile() || cleanHash(root, file, fs.readFileSync(full)) !== cleanHash(root, file, bytes)) {
          throw new Error(`切换后配置内容不一致：${file}`);
        }
        // Git may normalize CRLF via core.autocrlf. Restore exact operator bytes
        // only after confirming the applied content matches the saved aggregate.
        if (!fs.readFileSync(full).equals(bytes)) fs.writeFileSync(full, bytes);
        if (!fs.readFileSync(full).equals(bytes)) throw new Error(`切换后配置字节不一致：${file}`);
      }
    }
    const final = inspect(root);
    if (final.branch !== 'main' || git(root, ['rev-parse', 'HEAD']).trim() !== final.remote) {
      throw new Error('未到达精确的 origin/main，停止发布。');
    }
    log('main 已同步，ACLED 配置保持原字节；即将使用 main 中的既有发布流程。');
    return { ...plan, backup, stash };
  } catch (error) {
    throw new Error(`准备 main 失败，尚未 push 或触发 workflow。${backup ? ` 备份：${backup}。` : ''}${stash ? ` 保留 stash：${stash}。` : ''} ${error.message}`);
  }
}
