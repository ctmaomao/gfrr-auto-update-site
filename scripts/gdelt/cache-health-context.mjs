const BUBBLE_SCHEDULE_CADENCE_HOURS = 7 * 24;
const BUBBLE_SCHEDULE_GRACE_HOURS = 12;

function finiteHours(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isLaterTimestamp(laterValue, earlierValue) {
  const later = Date.parse(laterValue || '');
  const earlier = Date.parse(earlierValue || '');
  return Number.isFinite(later) && Number.isFinite(earlier) && later > earlier;
}

function hoursBetween(laterValue, earlierValue) {
  const later = Date.parse(laterValue || '');
  const earlier = Date.parse(earlierValue || '');
  if (!Number.isFinite(later) || !Number.isFinite(earlier) || later < earlier) return null;
  return (later - earlier) / 3_600_000;
}

export function classifyOilNewsPostRefresh({
  cacheGeneratedAt,
  cacheAgeHours,
  errorCooldownHours,
  productionGeneratedAt,
  productionStatus,
  productionRequestMode
}) {
  const productionNewerThanCache = isLaterTimestamp(productionGeneratedAt, cacheGeneratedAt);
  const productionHoursAfterCache = hoursBetween(productionGeneratedAt, cacheGeneratedAt);
  const productionStillDegraded = productionStatus === 'error';
  if (productionNewerThanCache && productionStillDegraded) {
    const age = finiteHours(cacheAgeHours);
    const cooldown = finiteHours(errorCooldownHours);
    if (age !== null && cooldown !== null && age < cooldown) {
      return {
        state: 'expected_error_cooldown_after_refresh',
        productionNewerThanCache,
        requestMode: productionRequestMode || null,
        errorCooldownHours: cooldown,
        cooldownRemainingHours: Math.round((cooldown - age) * 100) / 100,
        nextAction: 'wait_until_error_cooldown_expires_then_rerun_after_scheduled_refresh'
      };
    }
    if (cooldown !== null && (productionHoursAfterCache === null || productionHoursAfterCache < cooldown)) {
      return {
        state: 'degraded_awaiting_post_cooldown_refresh_evidence',
        productionNewerThanCache,
        requestMode: productionRequestMode || null,
        errorCooldownHours: cooldown,
        productionHoursAfterCache:
          productionHoursAfterCache === null ? null : Math.round(productionHoursAfterCache * 100) / 100,
        nextAction: 'wait_for_first_scheduled_refresh_after_error_cooldown_then_rerun_strict_review'
      };
    }
    return {
      state: 'persistent_error_after_cooldown_expiry',
      productionNewerThanCache,
      requestMode: productionRequestMode || null,
      nextAction: 'diagnose_oil_news_cooldown_persistence_without_loosening_ttl_or_backoff'
    };
  }
  if (productionStillDegraded) {
    return {
      state: 'degraded_awaiting_post_cache_refresh_evidence',
      productionNewerThanCache,
      requestMode: productionRequestMode || null,
      nextAction: 'wait_for_next_scheduled_oil_news_refresh_then_rerun_strict_review'
    };
  }
  return {
    state: 'production_artifact_not_degraded',
    productionNewerThanCache,
    requestMode: productionRequestMode || null,
    nextAction: 'continue_normal_cache_health_monitoring'
  };
}

export function classifyBubbleScheduleContext(ageHours, freshTtlHours) {
  const age = finiteHours(ageHours);
  const freshTtl = finiteHours(freshTtlHours);
  if (age === null || freshTtl === null) {
    return {
      state: 'schedule_context_unavailable',
      scheduledCadenceHours: BUBBLE_SCHEDULE_CADENCE_HOURS,
      scheduleGraceHours: BUBBLE_SCHEDULE_GRACE_HOURS,
      nextAction: 'review_bubble_cache_timestamp'
    };
  }
  if (age <= freshTtl) {
    return {
      state: 'fresh_within_ttl',
      scheduledCadenceHours: BUBBLE_SCHEDULE_CADENCE_HOURS,
      scheduleGraceHours: BUBBLE_SCHEDULE_GRACE_HOURS,
      nextAction: 'continue_normal_cache_health_monitoring'
    };
  }
  if (age <= BUBBLE_SCHEDULE_CADENCE_HOURS + BUBBLE_SCHEDULE_GRACE_HOURS) {
    return {
      state: 'expected_pre_refresh_schedule_gap',
      scheduledCadenceHours: BUBBLE_SCHEDULE_CADENCE_HOURS,
      scheduleGraceHours: BUBBLE_SCHEDULE_GRACE_HOURS,
      hoursPastFreshTtl: Math.round((age - freshTtl) * 100) / 100,
      nextAction: 'wait_for_next_scheduled_bubble_watch_refresh_then_rerun_strict_review'
    };
  }
  return {
    state: 'scheduled_refresh_overdue',
    scheduledCadenceHours: BUBBLE_SCHEDULE_CADENCE_HOURS,
    scheduleGraceHours: BUBBLE_SCHEDULE_GRACE_HOURS,
    hoursPastScheduledCadence: Math.round((age - BUBBLE_SCHEDULE_CADENCE_HOURS) * 100) / 100,
    nextAction: 'diagnose_bubble_watch_refresh_or_cache_write'
  };
}

export function summarizePostRefreshContexts(rows) {
  const contexts = rows.map((row) => row.refreshContext).filter(Boolean);
  const nextActions = [...new Set(contexts.map((context) => context.nextAction).filter(Boolean))];
  return {
    expectedErrorCooldownCount: contexts.filter(
      (context) => context.state === 'expected_error_cooldown_after_refresh'
    ).length,
    awaitingPostCooldownRefreshCount: contexts.filter(
      (context) => context.state === 'degraded_awaiting_post_cooldown_refresh_evidence'
    ).length,
    persistentAfterCooldownCount: contexts.filter(
      (context) => context.state === 'persistent_error_after_cooldown_expiry'
    ).length,
    expectedScheduleGapCount: contexts.filter(
      (context) => context.state === 'expected_pre_refresh_schedule_gap'
    ).length,
    scheduledRefreshOverdueCount: contexts.filter(
      (context) => context.state === 'scheduled_refresh_overdue'
    ).length,
    nextActions
  };
}
