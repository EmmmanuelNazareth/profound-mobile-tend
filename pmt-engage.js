/**
 * pmt-engage.js — first-party engagement layer for Profound Mobile Tend.
 *   1) Welcome popup on first visit (once every 7 days) pushing the
 *      "Buy 2 washes, get the 3rd free" promo.
 *   2) Floating chat bubble (bottom-left) → opens a chat panel. Messages
 *      POST to /api/chat, which emails sales@profoundmobiletend.com.
 *      Owner replies by email; customer sees an auto-acknowledgement and
 *      a note that a reply is coming to their inbox.
 *
 * No external services. No tracking scripts. All styling injected inline
 * so there are no new CSS files to load.
 */
(function(){
  if (window.PMT_ENGAGE) return;
  window.PMT_ENGAGE = true;

  // ── Visitor ping ─────────────────────────────────────────────
  // Fire once per browser session — server adds geo from Vercel
  // edge headers and emails the owner. Skip in obvious dev/preview
  // contexts so we don't spam the inbox while testing.
  (function pingVisit(){
    try {
      if (sessionStorage.getItem('pmt_visit_pinged_v1')) return;
      // Skip on localhost & on Vercel auto-generated preview hostnames
      const h = location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || /\.vercel\.app$/i.test(h)) return;
      sessionStorage.setItem('pmt_visit_pinged_v1','1');
      fetch('/api/visit', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          page: location.pathname + location.search,
          referrer: document.referrer || 'Direct',
          screen: (window.innerWidth||0)+'x'+(window.innerHeight||0),
          lang: navigator.language || ''
        }),
        keepalive: true
      }).catch(()=>{});
    } catch(e) {}
  })();

  // ── Shared styles ──────────────────────────────────────────────
  const css = `
  .pmt-ov{position:fixed;inset:0;background:rgba(4,4,4,0.78);backdrop-filter:blur(10px);z-index:4000;display:flex;align-items:center;justify-content:center;padding:1.3rem;opacity:0;pointer-events:none;transition:opacity 0.38s ease;}
  .pmt-ov.on{opacity:1;pointer-events:auto;}
  .pmt-welcome{max-width:440px;width:100%;background:linear-gradient(150deg,#121212 0%,#0a1a0a 100%);border:1px solid rgba(60,142,57,0.32);border-radius:14px;padding:2.4rem 1.9rem 1.9rem;color:#f4f2ee;font-family:'Outfit',sans-serif;position:relative;transform:translateY(18px) scale(0.98);transition:transform 0.42s cubic-bezier(.2,.8,.2,1);box-shadow:0 20px 70px rgba(0,0,0,0.6);text-align:center;}
  .pmt-ov.on .pmt-welcome{transform:translateY(0) scale(1);}
  .pmt-welcome .close{position:absolute;top:0.8rem;right:1rem;background:none;border:none;color:rgba(244,242,238,0.5);font-size:1.4rem;cursor:pointer;line-height:1;padding:0.2rem 0.4rem;transition:color 0.2s;}
  .pmt-welcome .close:hover{color:#52b84f;}
  .pmt-welcome .badge{width:72px;height:72px;border-radius:50%;border:1px solid rgba(60,142,57,0.45);background:rgba(8,8,8,0.85);display:flex;align-items:center;justify-content:center;margin:0 auto 1.1rem;animation:pmtSpin 22s linear infinite;}
  .pmt-welcome .badge-in{display:flex;flex-direction:column;align-items:center;animation:pmtSpin 22s linear infinite reverse;}
  .pmt-welcome .badge span{font-family:'Cormorant Garamond',serif;font-size:1.15rem;color:#52b84f;}
  .pmt-welcome .badge p{font-size:0.42rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(244,242,238,0.8);line-height:1.35;margin-top:0.1rem;}
  @keyframes pmtSpin{to{transform:rotate(360deg);}}
  .pmt-welcome .tag{font-size:0.64rem;letter-spacing:0.2em;text-transform:uppercase;color:#52b84f;font-weight:600;margin-bottom:0.6rem;}
  .pmt-welcome h2{font-family:'Cormorant Garamond',serif;font-size:1.85rem;font-weight:600;line-height:1.12;margin-bottom:0.5rem;letter-spacing:-0.01em;}
  .pmt-welcome h2 em{color:#52b84f;font-style:italic;}
  .pmt-welcome .sub{color:rgba(244,242,238,0.7);font-size:0.92rem;line-height:1.65;margin-bottom:1.4rem;font-weight:300;}
  .pmt-promo{background:linear-gradient(135deg,rgba(60,142,57,0.18),rgba(60,142,57,0.04));border:1px solid rgba(60,142,57,0.38);border-left:3px solid #52b84f;border-radius:6px;padding:1rem 1.1rem;margin-bottom:1.5rem;text-align:left;}
  .pmt-promo .deal{font-family:'Cormorant Garamond',serif;font-size:1.15rem;font-weight:600;color:#fff;margin-bottom:0.25rem;}
  .pmt-promo .deal em{color:#52b84f;font-style:italic;}
  .pmt-promo .fine{font-size:0.76rem;color:rgba(244,242,238,0.66);line-height:1.55;}
  .pmt-welcome .row{display:flex;gap:0.6rem;}
  .pmt-welcome .btn{flex:1;padding:0.85rem 1.1rem;border:none;border-radius:3px;font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;cursor:pointer;text-decoration:none;text-align:center;display:inline-flex;align-items:center;justify-content:center;transition:all 0.2s;}
  .pmt-welcome .btn.p{background:#3C8E39;color:#fff;}
  .pmt-welcome .btn.p:hover{background:#52b84f;color:#080808;}
  .pmt-welcome .btn.g{background:transparent;color:#f4f2ee;border:1px solid rgba(255,255,255,0.15);}
  .pmt-welcome .btn.g:hover{border-color:#52b84f;color:#52b84f;}

  /* ── Chat widget ── */
  .pmt-chat-btn{position:fixed;bottom:1.4rem;left:1.4rem;z-index:3999;width:58px;height:58px;border-radius:50%;background:#3C8E39;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 26px rgba(60,142,57,0.38),0 2px 6px rgba(0,0,0,0.4);transition:all 0.25s;font-family:'Outfit',sans-serif;}
  .pmt-chat-btn:hover{background:#52b84f;transform:translateY(-2px);box-shadow:0 12px 32px rgba(60,142,57,0.5);}
  .pmt-chat-btn svg{width:24px;height:24px;}
  .pmt-chat-dot{position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#ff3b3b;border:2px solid #3C8E39;animation:pmtPulse 1.6s ease-in-out infinite;}
  @keyframes pmtPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.35);opacity:0.65;}}
  .pmt-chat-panel{position:fixed;bottom:1.4rem;left:1.4rem;z-index:3999;width:360px;max-width:calc(100vw - 2rem);height:540px;max-height:calc(100vh - 2rem);background:#0c0c0c;border:1px solid rgba(60,142,57,0.28);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.55);opacity:0;transform:translateY(20px) scale(0.96);pointer-events:none;transition:all 0.32s cubic-bezier(.2,.8,.2,1);font-family:'Outfit',sans-serif;color:#f4f2ee;}
  .pmt-chat-panel.on{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
  .pmt-chat-head{padding:1.05rem 1.2rem;background:linear-gradient(135deg,#0a1a0a,#141414);border-bottom:1px solid rgba(60,142,57,0.22);display:flex;align-items:center;gap:0.7rem;}
  .pmt-chat-avatar{width:38px;height:38px;border-radius:50%;background:#3C8E39;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Cormorant Garamond',serif;font-size:1.15rem;font-weight:600;}
  .pmt-chat-title{flex:1;}
  .pmt-chat-title strong{display:block;font-size:0.92rem;font-weight:600;letter-spacing:0.01em;}
  .pmt-chat-title span{font-size:0.7rem;color:#52b84f;display:flex;align-items:center;gap:0.35rem;letter-spacing:0.04em;}
  .pmt-chat-title span::before{content:'';width:7px;height:7px;border-radius:50%;background:#52b84f;box-shadow:0 0 8px #52b84f;}
  .pmt-chat-x{background:none;border:none;color:rgba(244,242,238,0.55);font-size:1.3rem;cursor:pointer;padding:0.2rem 0.5rem;line-height:1;transition:color 0.2s;}
  .pmt-chat-x:hover{color:#52b84f;}
  .pmt-chat-body{flex:1;padding:1.1rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.7rem;background:#0c0c0c;}
  .pmt-msg{max-width:85%;padding:0.7rem 0.95rem;border-radius:14px;font-size:0.88rem;line-height:1.55;word-wrap:break-word;}
  .pmt-msg.bot{align-self:flex-start;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:4px;color:rgba(244,242,238,0.92);}
  .pmt-msg.me{align-self:flex-end;background:#3C8E39;color:#fff;border-bottom-right-radius:4px;}
  .pmt-msg .meta{display:block;font-size:0.66rem;color:rgba(244,242,238,0.45);margin-top:0.3rem;letter-spacing:0.04em;}
  .pmt-msg.me .meta{color:rgba(255,255,255,0.72);}
  .pmt-qreply{display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.3rem;}
  .pmt-qreply button{background:rgba(60,142,57,0.12);border:1px solid rgba(60,142,57,0.32);color:#52b84f;font-size:0.74rem;padding:0.45rem 0.8rem;border-radius:999px;cursor:pointer;font-family:inherit;transition:all 0.2s;}
  .pmt-qreply button:hover{background:rgba(60,142,57,0.22);color:#fff;}
  .pmt-chat-foot{padding:0.8rem 0.9rem;border-top:1px solid rgba(255,255,255,0.06);background:#0a0a0a;}
  .pmt-chat-form{display:flex;gap:0.5rem;align-items:flex-end;}
  .pmt-chat-form textarea{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#f4f2ee;padding:0.7rem 0.85rem;border-radius:10px;font-family:inherit;font-size:0.88rem;resize:none;outline:none;min-height:40px;max-height:110px;line-height:1.45;transition:border-color 0.2s;}
  .pmt-chat-form textarea:focus{border-color:#3C8E39;}
  .pmt-chat-form textarea::placeholder{color:rgba(244,242,238,0.4);}
  .pmt-chat-send{background:#3C8E39;color:#fff;border:none;border-radius:10px;width:42px;height:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.2s;}
  .pmt-chat-send:hover{background:#52b84f;}
  .pmt-chat-send svg{width:18px;height:18px;}
  .pmt-chat-send:disabled{opacity:0.5;cursor:not-allowed;}
  .pmt-intake{padding:0 1.1rem 0.9rem;}
  .pmt-intake label{display:block;font-size:0.7rem;color:rgba(244,242,238,0.6);margin-bottom:0.35rem;letter-spacing:0.04em;}
  .pmt-intake input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#f4f2ee;padding:0.65rem 0.85rem;border-radius:8px;font-family:inherit;font-size:0.85rem;outline:none;margin-bottom:0.55rem;}
  .pmt-intake input:focus{border-color:#3C8E39;}

  @media (max-width:520px){
    .pmt-chat-btn{bottom:1.05rem;left:1.05rem;width:54px;height:54px;}
    .pmt-chat-panel{bottom:0;left:0;right:0;width:100vw;max-width:100vw;height:92svh;max-height:92svh;border-radius:14px 14px 0 0;}
    .pmt-welcome{padding:2rem 1.4rem 1.5rem;}
    .pmt-welcome h2{font-size:1.6rem;}
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Welcome popup ──────────────────────────────────────────────
  const WELCOME_KEY = 'pmt_welcome_seen_v1';
  function showWelcome(){
    try{
      const last = parseInt(localStorage.getItem(WELCOME_KEY)||'0',10);
      const week = 7*24*60*60*1000;
      if (Date.now()-last < week) return;
    }catch(e){}

    const ov = document.createElement('div');
    ov.className = 'pmt-ov';
    ov.innerHTML = `
      <div class="pmt-welcome">
        <button class="close" aria-label="Close">×</button>
        <div class="badge"><div class="badge-in"><span>✝</span><p>Faith<br/>Drives<br/>Clean</p></div></div>
        <div class="tag">Welcome</div>
        <h2>Welcome to<br/><em>Profound Mobile Tend</em></h2>
        <div class="sub">Premium mobile detailing, delivered to your door. Before you go — here's a little something.</div>
        <div class="pmt-promo">
          <div class="deal">Book 2 washes in a row — <em>the 3rd is on us.</em></div>
          <div class="fine">Book any two washes back-to-back with Profound Mobile Tend and your third wash is completely free. Loyalty rewarded, plain and simple.</div>
        </div>
        <div class="row">
          <a class="btn p" href="/#booking">Book a Wash →</a>
          <button class="btn g" type="button">Maybe Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    requestAnimationFrame(()=>ov.classList.add('on'));

    const close = ()=>{
      try{ localStorage.setItem(WELCOME_KEY, String(Date.now())); }catch(e){}
      ov.classList.remove('on');
      setTimeout(()=>ov.remove(), 400);
    };
    ov.querySelector('.close').addEventListener('click', close);
    ov.querySelector('.btn.g').addEventListener('click', close);
    ov.querySelector('.btn.p').addEventListener('click', close);
    ov.addEventListener('click', (e)=>{ if(e.target===ov) close(); });
  }

  // Kick off welcome after brief delay so it feels intentional, not obnoxious
  setTimeout(showWelcome, 1100);

  // ── Chat widget ────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.className = 'pmt-chat-btn';
  btn.setAttribute('aria-label','Open chat');
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><span class="pmt-chat-dot"></span>`;
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'pmt-chat-panel';
  panel.innerHTML = `
    <div class="pmt-chat-head">
      <div class="pmt-chat-avatar">P</div>
      <div class="pmt-chat-title"><strong>Profound Mobile Tend</strong><span>We usually reply within an hour</span></div>
      <button class="pmt-chat-x" aria-label="Close">×</button>
    </div>
    <div class="pmt-intake" id="pmt-intake">
      <label>Your name</label>
      <input type="text" id="pmt-cname" placeholder="e.g. Jordan"/>
      <label>Your email (so we can reply)</label>
      <input type="email" id="pmt-cemail" placeholder="you@example.com"/>
    </div>
    <div class="pmt-chat-body" id="pmt-chat-body"></div>
    <div class="pmt-chat-foot">
      <form class="pmt-chat-form" id="pmt-chat-form">
        <textarea id="pmt-chat-input" placeholder="Type a message…" rows="1"></textarea>
        <button type="submit" class="pmt-chat-send" id="pmt-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
      </form>
    </div>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector('#pmt-chat-body');
  const form = panel.querySelector('#pmt-chat-form');
  const input = panel.querySelector('#pmt-chat-input');
  const intake = panel.querySelector('#pmt-intake');
  const nameEl = panel.querySelector('#pmt-cname');
  const emailEl = panel.querySelector('#pmt-cemail');

  const SESS_KEY = 'pmt_chat_sess_v1';
  function getSess(){
    let s;
    try{ s = JSON.parse(localStorage.getItem(SESS_KEY)||'null'); }catch(e){}
    if (!s){
      s = {id:'pmt-'+Math.random().toString(36).slice(2,10)+Date.now().toString(36), name:'', email:'', hist:[]};
    }
    return s;
  }
  function saveSess(s){ try{ localStorage.setItem(SESS_KEY, JSON.stringify(s)); }catch(e){} }
  let sess = getSess();

  function addMsg(text, who, opts){
    opts = opts||{};
    const d = document.createElement('div');
    d.className = 'pmt-msg '+(who==='me'?'me':'bot');
    const t = new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    d.innerHTML = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br/>')
      + `<span class="meta">${who==='me'?'You':'Profound'} · ${t}</span>`;
    body.appendChild(d);
    if (opts.quickReplies){
      const qr = document.createElement('div');
      qr.className = 'pmt-qreply';
      opts.quickReplies.forEach(q=>{
        const b = document.createElement('button');
        b.type='button'; b.textContent=q;
        b.addEventListener('click',()=>{ input.value=q; form.requestSubmit(); });
        qr.appendChild(b);
      });
      body.appendChild(qr);
    }
    body.scrollTop = body.scrollHeight;
    sess.hist.push({who, text, at:Date.now()});
    saveSess(sess);
  }

  function showIntake(){
    if (sess.name && sess.email){
      intake.style.display='none';
      nameEl.value = sess.name; emailEl.value = sess.email;
    } else {
      intake.style.display='block';
    }
  }

  function hydrate(){
    body.innerHTML = '';
    if (sess.hist.length){
      sess.hist.forEach(m=>{
        const temp = sess.hist; sess.hist = []; // don't double-save
        addMsg(m.text, m.who);
        sess.hist = temp;
      });
    } else {
      addMsg(`Hey 👋 Welcome to Profound Mobile Tend. I'm here to help — ask anything about services, pricing, or booking.`, 'bot', {
        quickReplies:['Book a wash','What does the full detail include?','Do you come to me?','Refund policy']
      });
    }
    showIntake();
  }
  hydrate();

  // Auto-resize textarea
  input.addEventListener('input', ()=>{
    input.style.height='auto';
    input.style.height = Math.min(input.scrollHeight, 110)+'px';
  });

  // Submit
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Collect intake if needed
    const name = (nameEl.value||sess.name||'').trim();
    const email = (emailEl.value||sess.email||'').trim();
    if (!name || !email){
      addMsg(`Before I send your message, please fill in your name and email above so I can reply.`,'bot');
      return;
    }
    sess.name = name; sess.email = email; saveSess(sess);
    intake.style.display='none';

    addMsg(text,'me');
    input.value=''; input.style.height='auto';

    // Send to owner
    try{
      const r = await fetch('/api/chat',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({sessionId:sess.id, name, email, message:text, page:location.pathname})
      });
      if (!r.ok) throw new Error('relay failed');
      addMsg(`Got it — your message went straight to ${name.split(' ')[0] ? 'our team' : 'us'}. We'll reply to ${email} shortly. Anything else?`,'bot');
    }catch(err){
      // Fallback: mailto
      const fallback = `mailto:sales@profoundmobiletend.com?subject=${encodeURIComponent('Chat from '+name)}&body=${encodeURIComponent(text+'\n\n— '+name+' ('+email+')')}`;
      addMsg(`We're having trouble reaching our server — <a href="${fallback}" style="color:#52b84f;">tap here to send as email instead</a>, or try again in a moment.`,'bot');
    }
  });
  input.addEventListener('keydown',(e)=>{
    if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); form.requestSubmit(); }
  });

  const togglePanel = (on)=>{
    if (on){
      panel.classList.add('on');
      btn.style.display='none';
      setTimeout(()=>input.focus(),250);
    } else {
      panel.classList.remove('on');
      btn.style.display='flex';
    }
  };
  btn.addEventListener('click',()=>togglePanel(true));
  panel.querySelector('.pmt-chat-x').addEventListener('click',()=>togglePanel(false));
})();
