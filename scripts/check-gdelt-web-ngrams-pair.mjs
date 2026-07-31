#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  fetchGdeltWebNgramsPair,
  findFirstAvailableGdeltWebNgramsPair,
  GDELT_WEB_NGRAMS_PAIR_CONTRACT,
  probeGdeltWebNgramsPair
} from './gdelt/gdelt-web-ngrams-pair.mjs';
import { fetchFirstAvailableNgrams } from './oil-directional/diagnose-gdelt-web-ngrams.mjs';

const FIRST = '20260731010000';
const SECOND = '20260731004500';

async function checkAtomicProbe() {
  const calls = [];
  const complete = await probeGdeltWebNgramsPair({
    timestamp: FIRST,
    probeFile: async ({ timestamp, kind }) => {
      calls.push(`${timestamp}:${kind}`);
      return {
        ok: true,
        status: 200,
        url: `https://forbidden.example/${kind}`,
        contentLength: kind === 'ngrams' ? 120 : 80,
        lastModified: 'Thu, 31 Jul 2026 01:02:00 GMT',
        diagnostics: { endpointType: `web_${kind}_probe`, status: 200 }
      };
    }
  });
  assert.equal(complete.contractVersion, GDELT_WEB_NGRAMS_PAIR_CONTRACT);
  assert.equal(complete.status, 'pair_available');
  assert.deepEqual(calls, [`${FIRST}:ngrams`, `${FIRST}:toc`]);
  assert.equal(JSON.stringify(complete).includes('forbidden.example'), false);

  const incompleteCalls = [];
  const incomplete = await probeGdeltWebNgramsPair({
    timestamp: FIRST,
    probeFile: async ({ kind }) => {
      incompleteCalls.push(kind);
      return {
        ok: kind === 'ngrams',
        status: kind === 'ngrams' ? 200 : 404,
        diagnostics: { endpointType: `web_${kind}_probe`, errorCode: kind === 'toc' ? 'not_found' : null }
      };
    }
  });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.status, 'toc_unavailable');
  assert.deepEqual(incompleteCalls, ['ngrams', 'toc']);
}

async function checkPairDiscovery() {
  const discovery = await findFirstAvailableGdeltWebNgramsPair({
    timestamps: [FIRST, SECOND],
    probePair: async ({ timestamp }) => ({
      contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
      ok: timestamp === SECOND,
      status: timestamp === SECOND ? 'pair_available' : 'toc_unavailable',
      timestamp
    })
  });
  assert.equal(discovery.ok, true);
  assert.equal(discovery.selectedTimestamp, SECOND);
  assert.equal(discovery.attempts.length, 2);

  const unavailable = await findFirstAvailableGdeltWebNgramsPair({
    timestamps: [FIRST],
    probePair: async ({ timestamp }) => ({
      contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
      ok: false,
      status: 'ngrams_unavailable',
      timestamp
    })
  });
  assert.equal(unavailable.status, 'source_unavailable');
  assert.equal(unavailable.selectedTimestamp, null);
}

async function checkPairFetch() {
  const calls = [];
  const fetched = await fetchGdeltWebNgramsPair({
    timestamp: FIRST,
    fetchText: async ({ timestamp, kind }) => {
      calls.push(`${timestamp}:${kind}`);
      return {
        text: kind === 'ngrams' ? '1\toil supply disruption\t1' : '{"ID":1}',
        url: `https://forbidden.example/${kind}`,
        diagnostics: { endpointType: `web_${kind}`, status: 200 }
      };
    }
  });
  assert.deepEqual(calls, [`${FIRST}:ngrams`, `${FIRST}:toc`]);
  assert.equal(fetched.status, 'live');
  assert.equal(fetched.ngramsText.includes('oil supply'), true);
  assert.equal(fetched.tocText, '{"ID":1}');
  assert.equal(JSON.stringify(fetched.diagnostics).includes('forbidden.example'), false);

  await assert.rejects(
    fetchGdeltWebNgramsPair({
      timestamp: FIRST,
      fetchText: async ({ kind }) => {
        if (kind === 'toc') {
          const error = new Error('provider URL must not escape');
          error.gdeltDiagnostics = { endpointType: 'web_ngrams_toc', errorCode: 'not_found' };
          throw error;
        }
        return { text: 'raw ngrams must not escape diagnostics', diagnostics: { status: 200 } };
      }
    }),
    (error) => {
      assert.equal(error.code, 'gdelt_web_ngrams_pair_unavailable');
      assert.equal(JSON.stringify(error.pairDiagnostics).includes('raw ngrams'), false);
      assert.equal(error.pairDiagnostics.failure.errorCode, 'not_found');
      return true;
    }
  );
}

async function checkDiagnosisPairProjection() {
  const fetched = await fetchFirstAvailableNgrams([FIRST], {
    probeBeforeDownload: false
  }, {
    fetchPair: async ({ timestamp }) => ({
      contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
      status: 'live',
      timestamp,
      ngramsText: '1\toil supply disruption now\t1',
      tocText: '{"ID":1,"title":"transient title","url":"https://example.com/story"}',
      diagnostics: {
        ngrams: { diagnostics: { endpointType: 'web_ngrams', status: 200 } },
        toc: { diagnostics: { endpointType: 'web_ngrams_toc', status: 200 } }
      }
    })
  });
  assert.equal(fetched.text, fetched.ngramsText);
  assert.equal(fetched.text.includes('oil supply'), true);
  assert.equal(fetched.tocText.includes('transient title'), true);
  assert.equal(JSON.stringify(fetched.attempts).includes('transient title'), false);
  assert.equal(fetched.attempts[0].diagnostics.endpointType, 'web_ngrams');
  assert.equal(fetched.attempts[0].tocDiagnostics.endpointType, 'web_ngrams_toc');
}

async function main() {
  await checkAtomicProbe();
  await checkPairDiscovery();
  await checkPairFetch();
  await checkDiagnosisPairProjection();
  await assert.rejects(probeGdeltWebNgramsPair({ timestamp: 'invalid' }), /YYYYMMDDHHMMSS/u);
  console.log('PASS check-gdelt-web-ngrams-pair');
}

main().catch((error) => {
  console.error(`FAIL check-gdelt-web-ngrams-pair: ${error.message}`);
  process.exit(1);
});
