/**
 * 前後端協定版本。後端（Apps Script Code.gs）與前端（GitHub Pages）分開更新，
 * 前端會比對此版本；後端較舊時提示管理員更新 Code.gs 並發佈新版本。
 * 每次 API 或資料結構有不相容的變更時請 +1。
 */
export const API_VERSION = 3;
