// ===========================================================================
//  renderer/inject-text.js — builds the script we run INSIDE a panel's page to
//  type the prompt and press send. Selectors differ per site; the payload is a
//  self-contained IIFE so it runs in the guest with no closure over our code.
// ===========================================================================

// opts.append → add text after existing content (don't wipe a pasted image).
// opts.submitDelay → ms before the FIRST send attempt.
// opts.submitTries → extra 400 ms retries waiting for an ENABLED send button
// (so an in-flight image upload finishes before we send).
(function () { /* MAI-IIFE */
function buildInjection(inputSel, sendSel, text, opts = {}) {
  const append = !!opts.append;
  const submitDelay = opts.submitDelay != null ? opts.submitDelay : 250;
  const submitTries = opts.submitTries != null ? opts.submitTries : 2;
  return `(function () {
    var text = ${JSON.stringify(text)};
    var inputSel = ${JSON.stringify(inputSel)};
    var sendSel = ${JSON.stringify(sendSel)};
    var append = ${append};

    function setNative(el, v) {
      var proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var d = Object.getOwnPropertyDescriptor(proto, 'value');
      var val = append ? (el.value || '') + v : v;
      if (d && d.set) d.set.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function setEditable(el, v) {
      el.focus();
      var sel = window.getSelection();
      var r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);          // caret to END (keeps any pasted image)
      if (!append) {              // replace everything when not appending
        r.selectNodeContents(el);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText', false, v);
    }
    function fill(el, v) {
      if (!v) return;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') setNative(el, v);
      else setEditable(el, v);
    }
    function pressEnter(el) {
      ['keydown', 'keypress', 'keyup'].forEach(function (t) {
        el.dispatchEvent(new KeyboardEvent(t, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true,
        }));
      });
    }
    function attempt(n) {
      var input = document.querySelector(inputSel);
      if (!input) {
        if (n < 8) return setTimeout(function () { attempt(n + 1); }, 400);
        return;
      }
      input.focus();
      fill(input, text);
      // Wait for an ENABLED send button (upload may still be in flight),
      // then click it; fall back to Enter only after the retries run out.
      function trySend(left) {
        var btn = document.querySelector(sendSel);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') return btn.click();
        if (left > 0) return setTimeout(function () { trySend(left - 1); }, 400);
        pressEnter(input);
      }
      setTimeout(function () { trySend(${submitTries}); }, ${submitDelay});
    }
    attempt(0);
  })();`;
}

Object.assign(window.MAI, { buildInjection });
})();
