import { syncedSetting } from './storage';

/** storage.sync key: `false` turns the masking log off; absent means on. */
export const LOG_ENABLED_KEY = 'maskingLogEnabled';

export const DEFAULT_LOG_ENABLED = true;

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const logEnabled = syncedSetting(LOG_ENABLED_KEY, isBoolean, DEFAULT_LOG_ENABLED);

/** Whether maskings are written to the log (lib/log/). */
export const getLogEnabled = logEnabled.get;
export const setLogEnabled = logEnabled.set;
export const onLogEnabledChange = logEnabled.onChange;
