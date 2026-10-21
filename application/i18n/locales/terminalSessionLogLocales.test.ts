import assert from 'node:assert/strict';
import test from 'node:test';
import en from './en';
import es from './es';
import ru from './ru';
import zhCN from './zh-CN';
import zhTW from './zh-TW';

const keys = [
  'terminal.toolbar.openSessionLog',
  'terminal.toolbar.sessionLogActions',
  'terminal.toolbar.sessionLog.reveal',
  'terminal.toolbar.sessionLog.chooseApplication',
  'terminal.toolbar.sessionLog.systemDefault',
  'terminal.toolbar.sessionLog.rememberApplication',
  'terminal.toolbar.openSessionLogFailed',
] as const;

test('saved session log actions are translated in every shipped locale', () => {
  for (const [locale, messages] of Object.entries({ en, es, ru, 'zh-CN': zhCN, 'zh-TW': zhTW })) {
    for (const key of keys) assert.ok(messages[key], `${locale} is missing ${key}`);
  }
});
