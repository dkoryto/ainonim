// The content script on every page; what it does is in lib/content/session.ts.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { runContentScript } from '~/lib/content/session';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    runContentScript(location.href, (teardown) => {
      ctx.onInvalidated(teardown);
    });
  },
});
