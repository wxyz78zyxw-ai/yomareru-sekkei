/* consultant-chat.js ── 読まれる設計コンサルタント(右下フロート式チャットUI)
 *
 * ステージング: まだ index.html には繋いでいません(公開は総帥GO後)。
 * 確認方法: consultant-chat.html をブラウザで開く。
 *
 * バックエンド = scripts\agent-tasks\yomareru-consultant-chat.ps1 を -Serve で起動し
 *   http://localhost:8785/chat に POST {sessionId, message} → {reply}。
 * 公開時は ENDPOINT を Cloudflare Tunnel の https URL に差し替える(DEPLOY-NOTES.md)。
 */
(function () {
  "use strict";

  // 本番エンドポイント(Cloudflare Tunnel: consult.nagaban-ai.com → localhost:8785)。
  // window.YOMARERU_CONSULTANT_ENDPOINT が定義されていればそれを優先(ステージング上書き用)。
  var ENDPOINT = (window.YOMARERU_CONSULTANT_ENDPOINT) || "https://consult.nagaban-ai.com/chat";

  // セッションID(訪問者ごと・PIIを含まない・localStorage に保持)
  function getSessionId() {
    try {
      var k = "yomareru_consult_sid";
      var v = localStorage.getItem(k);
      if (!v) {
        v = "web-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return "web-" + Math.random().toString(36).slice(2, 10);
    }
  }
  var SESSION_ID = getSessionId();

  // ---- スタイル(サイトの色: navy #1A2B4A / gold #C1A23C / ivory #F2EBDD) ----
  var css = ''
    + '#yc-fab{position:fixed;right:20px;bottom:20px;z-index:9998;background:#1A2B4A;color:#F2EBDD;'
    + 'border:none;border-radius:30px;padding:14px 20px;font-size:15px;cursor:pointer;'
    + 'box-shadow:0 4px 16px rgba(0,0,0,.25);font-family:"Hiragino Mincho ProN","Yu Mincho",serif;letter-spacing:.05em}'
    + '#yc-fab .yc-dot{color:#C1A23C;margin-right:7px}'
    + '#yc-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:360px;max-width:calc(100vw - 32px);'
    + 'height:520px;max-height:calc(100vh - 40px);display:none;flex-direction:column;background:#F2EBDD;'
    + 'border:1px solid #C1A23C;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.3);'
    + 'font-family:"Hiragino Mincho ProN","Yu Mincho",serif}'
    + '#yc-head{background:#1A2B4A;color:#F2EBDD;padding:13px 16px;display:flex;align-items:center;justify-content:space-between}'
    + '#yc-head b{font-weight:normal;font-size:15px;letter-spacing:.05em}'
    + '#yc-head .yc-sub{color:#cdd3df;font-size:11px;margin-top:2px;line-height:1.5}'
    + '#yc-close{background:none;border:none;color:#F2EBDD;font-size:20px;cursor:pointer;line-height:1;padding:0 4px}'
    + '#yc-body{flex:1;overflow-y:auto;padding:14px;font-size:14px;line-height:1.85}'
    + '.yc-msg{margin:0 0 14px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}'
    + '.yc-bot{color:#222}'
    + '.yc-bot .yc-name{color:#C1A23C;font-size:11px;letter-spacing:.1em;display:block;margin-bottom:3px}'
    + '.yc-user{text-align:right}'
    + '.yc-user .yc-bub{display:inline-block;background:#1A2B4A;color:#F2EBDD;border-radius:10px;'
    + 'padding:8px 12px;text-align:left;max-width:85%}'
    + '#yc-foot{border-top:1px solid #e2d9c4;padding:10px;background:#fff}'
    + '#yc-note{font-size:10.5px;color:#6a6a6a;margin:0 0 8px;line-height:1.6}'
    + '#yc-form{display:flex;gap:8px}'
    + '#yc-input{flex:1;border:1px solid #ccc;border-radius:8px;padding:9px 10px;font-size:14px;resize:none;'
    + 'font-family:inherit;height:40px;max-height:90px}'
    + '#yc-send{background:#C1A23C;color:#1A2B4A;border:none;border-radius:8px;padding:0 16px;font-size:14px;cursor:pointer}'
    + '#yc-send:disabled{opacity:.5;cursor:default}'
    + '.yc-typing{color:#888;font-size:13px}';
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  // ---- DOM ----
  var fab = document.createElement("button");
  fab.id = "yc-fab";
  fab.innerHTML = '<span class="yc-dot">●</span>読まれる設計に 相談する';
  document.body.appendChild(fab);

  var panel = document.createElement("div");
  panel.id = "yc-panel";
  panel.innerHTML = ''
    + '<div id="yc-head"><div><b>読まれる設計 ご相談</b>'
    + '<div class="yc-sub">一次受けです。最後は 永盛が 直接お話しします。</div></div>'
    + '<button id="yc-close" aria-label="閉じる">×</button></div>'
    + '<div id="yc-body"></div>'
    + '<div id="yc-foot">'
    + '<p id="yc-note">※ ここでは 見積金額・ご契約は お出ししません(最後は 永盛が 直接)。'
    + 'パスワード等の 認証情報は 入力しないでください。</p>'
    + '<div id="yc-form"><textarea id="yc-input" placeholder="お困りごとを どうぞ(例: AIで検索しても うちが出てこない)" rows="1"></textarea>'
    + '<button id="yc-send">送る</button></div></div>';
  document.body.appendChild(panel);

  var body = panel.querySelector("#yc-body");
  var input = panel.querySelector("#yc-input");
  var sendBtn = panel.querySelector("#yc-send");

  function addBot(text) {
    var d = document.createElement("div");
    d.className = "yc-msg yc-bot";
    var name = document.createElement("span");
    name.className = "yc-name";
    name.textContent = "読まれる設計";
    d.appendChild(name);
    d.appendChild(document.createTextNode(text));
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }
  function addUser(text) {
    var d = document.createElement("div");
    d.className = "yc-msg yc-user";
    var b = document.createElement("span");
    b.className = "yc-bub";
    b.textContent = text;
    d.appendChild(b);
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  }

  var greeted = false;
  function openPanel() {
    panel.style.display = "flex";
    fab.style.display = "none";
    if (!greeted) {
      greeted = true;
      addBot("はじめまして。永盛 斉の考え方を宿した、一次受けの相談役です。\n\n"
        + "「本物はあるのに、AIに読まれていない」── 多くの作り手が、そこで止まっています。\n\n"
        + "どんなお困りごとですか。まずは ひとことから。");
    }
    input.focus();
  }
  function closePanel() {
    panel.style.display = "none";
    fab.style.display = "block";
  }
  fab.addEventListener("click", openPanel);
  panel.querySelector("#yc-close").addEventListener("click", closePanel);

  var busy = false;
  function send() {
    if (busy) return;
    var msg = input.value.trim();
    if (!msg) return;
    addUser(msg);
    input.value = "";
    input.style.height = "40px";
    busy = true; sendBtn.disabled = true;

    var typing = document.createElement("div");
    typing.className = "yc-msg yc-bot yc-typing";
    typing.textContent = "考えています…";
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID, message: msg })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing.remove();
        addBot((data && data.reply) ? data.reply : "(うまく お返事できませんでした。もう一度どうぞ)");
      })
      .catch(function () {
        typing.remove();
        addBot("(つながりませんでした。時間をおいて もう一度どうぞ。お急ぎの方は nagaban.h@gmail.com へ)");
      })
      .finally(function () {
        busy = false; sendBtn.disabled = false; input.focus();
      });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  // textarea 自動伸長
  input.addEventListener("input", function () {
    input.style.height = "40px";
    input.style.height = Math.min(input.scrollHeight, 90) + "px";
  });
})();
