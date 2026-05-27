// 8.10 — React.Profiler wrapper + onRender handler.
//
// `withProfiler(id, Comp)` returns Comp untouched in release builds (so
// the Profiler tree is tree-shaken). In dev it wraps Comp in a
// <Profiler> whose onRender handler logs every commit that exceeded the
// 16 ms frame budget. Output goes to logInfo so it shows up in
// `adb logcat` alongside the rest of the app's logs.

import React, { Profiler } from 'react';
import { logInfo } from './log';

const FRAME_BUDGET_MS = 16;
const DEV = (typeof __DEV__ !== 'undefined') && __DEV__;

export function profilerOnRender(id, phase, actualDuration, baseDuration) {
  if (actualDuration < FRAME_BUDGET_MS) return;
  logInfo('perf', `${id} ${phase} ${actualDuration.toFixed(1)}ms (base ${baseDuration.toFixed(1)}ms)`);
}

export function withProfiler(id, Comp) {
  if (!DEV) return Comp;
  function Profiled(props) {
    return (
      <Profiler id={id} onRender={profilerOnRender}>
        <Comp {...props}/>
      </Profiler>
    );
  }
  Profiled.displayName = `Profiled(${id})`;
  return Profiled;
}
