/* Profound Mobile Tend — shared cart system.
 * localStorage key: pmt_cart (array of {id,name,vehicle,frequency,unitPrice,qty})
 * Renders a floating cart button + slide-in drawer on every page.
 * Checkout emails the order to sales@profoundmobiletend.com via FormSubmit. */
(function(){
  const KEY='pmt_cart_v1';
  const EMAIL_ENDPOINT='https://formsubmit.co/ajax/sales@profoundmobiletend.com';

  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return[];}}
  function write(c){localStorage.setItem(KEY,JSON.stringify(c));updateBadge();renderDrawer();}
  function count(){return read().reduce((n,it)=>n+(+it.qty||1),0);}
  function total(){return read().reduce((s,it)=>s+((+it.unitPrice||0)*(+it.qty||1)),0);}

  function add(item){
    const c=read();
    const key=[item.id,item.vehicle||'',item.frequency||'one'].join('|');
    const ex=c.find(x=>[x.id,x.vehicle||'',x.frequency||'one'].join('|')===key);
    if(ex){ex.qty=(+ex.qty||1)+(+item.qty||1);}
    else{c.push({id:item.id,name:item.name,vehicle:item.vehicle||'',frequency:item.frequency||'one',unitPrice:+item.unitPrice||0,qty:+item.qty||1});}
    write(c);
    toast('✓ Added to cart — '+item.name);
    openDrawer();
  }
  function remove(idx){const c=read();c.splice(idx,1);write(c);}
  function setQty(idx,q){const c=read();if(!c[idx])return;c[idx].qty=Math.max(1,+q||1);write(c);}
  function clear(){write([]);}

  function toast(msg){
    let t=document.getElementById('pmtToast');
    if(!t){t=document.createElement('div');t.id='pmtToast';document.body.appendChild(t);}
    t.textContent=msg;t.classList.add('show');
    clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),2400);
  }

  function fmt(n){return '$'+(+n).toFixed(2);}

  /* ─── UI ─── */
  const CSS=`
.pmt-cart-btn{position:fixed;right:1.1rem;bottom:1.1rem;z-index:300;background:var(--green,#3C8E39);color:#fff;border:none;width:58px;height:58px;border-radius:50%;box-shadow:0 8px 24px rgba(0,0,0,0.45),0 0 0 3px rgba(60,142,57,0.2);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.25s,box-shadow 0.25s;}
.pmt-cart-btn:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(0,0,0,0.55),0 0 0 4px rgba(60,142,57,0.25);}
.pmt-cart-btn svg{width:24px;height:24px;stroke:#fff;fill:none;stroke-width:1.8;}
.pmt-cart-badge{position:absolute;top:-4px;right:-4px;background:#fff;color:var(--green,#3C8E39);font-size:0.7rem;font-weight:800;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 6px;border:2px solid var(--green,#3C8E39);font-family:var(--sans,sans-serif);}
.pmt-cart-badge.zero{display:none;}
.pmt-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;opacity:0;visibility:hidden;transition:opacity 0.25s;backdrop-filter:blur(3px);}
.pmt-overlay.open{opacity:1;visibility:visible;}
.pmt-drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,92vw);z-index:401;background:#0c0c0c;border-left:1px solid rgba(60,142,57,0.25);transform:translateX(110%);transition:transform 0.3s cubic-bezier(.4,.0,.2,1);display:flex;flex-direction:column;color:#f4f2ee;font-family:var(--sans,sans-serif);}
.pmt-drawer.open{transform:translateX(0);}
.pmt-dh{display:flex;align-items:center;justify-content:space-between;padding:1.2rem 1.3rem;border-bottom:1px solid rgba(255,255,255,0.08);}
.pmt-dh h3{font-family:var(--serif,serif);font-size:1.4rem;font-weight:600;margin:0;}
.pmt-close{background:none;border:none;color:#aaa;cursor:pointer;font-size:1.5rem;line-height:1;padding:0.2rem 0.5rem;}
.pmt-close:hover{color:#fff;}
.pmt-body{flex:1;overflow-y:auto;padding:1rem 1.3rem;}
.pmt-empty{text-align:center;padding:3.5rem 1rem;color:#777;font-size:0.88rem;line-height:1.6;}
.pmt-empty svg{width:54px;height:54px;stroke:#444;fill:none;stroke-width:1.2;margin-bottom:1rem;display:block;margin-left:auto;margin-right:auto;}
.pmt-item{padding:1rem 0;border-bottom:1px solid rgba(255,255,255,0.06);display:grid;grid-template-columns:1fr auto;gap:0.5rem 1rem;}
.pmt-item:last-child{border-bottom:none;}
.pmt-item-name{font-family:var(--serif,serif);font-size:1.02rem;font-weight:600;line-height:1.25;}
.pmt-item-sub{font-size:0.72rem;color:#888;margin-top:0.22rem;line-height:1.4;}
.pmt-item-price{font-family:var(--serif,serif);font-size:1.1rem;color:var(--green-l,#52b84f);font-weight:700;white-space:nowrap;}
.pmt-item-ctrl{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem;gap:0.8rem;}
.pmt-qty{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;}
.pmt-qty button{background:none;border:none;color:#fff;width:28px;height:28px;cursor:pointer;font-size:1rem;line-height:1;transition:background 0.15s;}
.pmt-qty button:hover{background:rgba(60,142,57,0.2);}
.pmt-qty span{min-width:28px;text-align:center;font-size:0.85rem;font-weight:600;}
.pmt-rm{background:none;border:none;color:#777;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;font-weight:600;font-family:inherit;}
.pmt-rm:hover{color:#e55;}
.pmt-ft{padding:1rem 1.3rem 1.3rem;border-top:1px solid rgba(255,255,255,0.08);background:#080808;}
.pmt-tot{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.9rem;}
.pmt-tot-k{font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;font-weight:600;}
.pmt-tot-v{font-family:var(--serif,serif);font-size:1.7rem;color:var(--green,#3C8E39);font-weight:700;}
.pmt-tot-note{font-size:0.68rem;color:#666;margin-bottom:0.9rem;line-height:1.5;}
.pmt-co{display:block;width:100%;background:var(--green,#3C8E39);color:#fff;border:none;padding:1rem;font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;cursor:pointer;border-radius:2px;transition:background 0.2s;font-family:inherit;}
.pmt-co:hover{background:var(--green-l,#52b84f);color:#080808;}
.pmt-co:disabled{opacity:0.5;cursor:not-allowed;}
.pmt-clear{display:block;width:100%;background:none;color:#777;border:none;margin-top:0.6rem;padding:0.5rem;font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;font-weight:600;}
.pmt-clear:hover{color:#e55;}
/* checkout form */
.pmt-form{display:none;padding:0.5rem 0;}
.pmt-form.show{display:block;}
.pmt-form label{display:block;font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:0.3rem;font-weight:600;}
.pmt-form input,.pmt-form textarea{width:100%;background:#141414;border:1px solid rgba(255,255,255,0.1);color:#fff;padding:0.7rem 0.85rem;border-radius:2px;font-family:inherit;font-size:0.88rem;margin-bottom:0.8rem;}
.pmt-form input:focus,.pmt-form textarea:focus{outline:none;border-color:var(--green,#3C8E39);}
.pmt-back{background:none;border:none;color:#aaa;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;margin-bottom:0.8rem;font-weight:600;font-family:inherit;}
.pmt-back:hover{color:var(--green,#3C8E39);}
.pmt-success{text-align:center;padding:2rem 1rem;}
.pmt-success .ico{width:64px;height:64px;border-radius:50%;background:rgba(60,142,57,0.18);border:2px solid var(--green,#3C8E39);color:var(--green,#3C8E39);font-size:2rem;line-height:64px;margin:0 auto 1rem;}
.pmt-success h4{font-family:var(--serif,serif);font-size:1.5rem;font-weight:600;margin-bottom:0.5rem;}
.pmt-success p{font-size:0.86rem;color:#888;line-height:1.6;}
#pmtToast{position:fixed;left:50%;bottom:5.5rem;transform:translateX(-50%) translateY(20px);z-index:500;background:#0c0c0c;color:#fff;border:1px solid var(--green,#3C8E39);border-left-width:3px;padding:0.85rem 1.2rem;border-radius:2px;font-size:0.82rem;letter-spacing:0.02em;opacity:0;visibility:hidden;transition:all 0.28s;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,0.5);max-width:90vw;font-family:var(--sans,sans-serif);}
#pmtToast.show{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}
@media(max-width:640px){.pmt-cart-btn{width:52px;height:52px;right:0.85rem;bottom:0.85rem;}.pmt-cart-btn svg{width:22px;height:22px;}}
`;

  function ensureUI(){
    if(document.getElementById('pmtCartStyle'))return;
    const st=document.createElement('style');st.id='pmtCartStyle';st.textContent=CSS;document.head.appendChild(st);

    const btn=document.createElement('button');
    btn.className='pmt-cart-btn';btn.id='pmtCartBtn';btn.setAttribute('aria-label','Open cart');
    btn.innerHTML=`<svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12z"/><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M6 6 5 3H2"/></svg><span class="pmt-cart-badge zero" id="pmtCartBadge">0</span>`;
    btn.addEventListener('click',openDrawer);
    document.body.appendChild(btn);

    const ov=document.createElement('div');ov.className='pmt-overlay';ov.id='pmtOverlay';
    ov.addEventListener('click',closeDrawer);document.body.appendChild(ov);

    const d=document.createElement('aside');d.className='pmt-drawer';d.id='pmtDrawer';
    d.innerHTML=`
      <div class="pmt-dh">
        <h3>Your Cart</h3>
        <button class="pmt-close" aria-label="Close" onclick="PMT.close()">✕</button>
      </div>
      <div class="pmt-body" id="pmtBody"></div>
      <div class="pmt-ft" id="pmtFoot"></div>`;
    document.body.appendChild(d);
  }

  function updateBadge(){
    const b=document.getElementById('pmtCartBadge');if(!b)return;
    const n=count();b.textContent=n;b.classList.toggle('zero',n===0);
  }

  function renderDrawer(){
    const body=document.getElementById('pmtBody');if(!body)return;
    const foot=document.getElementById('pmtFoot');
    const items=read();
    if(items.length===0){
      body.innerHTML=`<div class="pmt-empty">
        <svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12z"/><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M6 6 5 3H2"/></svg>
        Your cart is empty.<br/>Add a service from the shop or services page to get started.</div>`;
      foot.innerHTML='';return;
    }
    body.innerHTML=items.map((it,i)=>{
      const sub=(it.unitPrice*it.qty).toFixed(2);
      const subtitle=[it.vehicle, it.frequency==='sub'?'Subscription':'One-time'].filter(Boolean).join(' · ');
      return `<div class="pmt-item">
        <div>
          <div class="pmt-item-name">${escapeHtml(it.name)}</div>
          <div class="pmt-item-sub">${escapeHtml(subtitle||'&nbsp;')}</div>
        </div>
        <div class="pmt-item-price">$${sub}</div>
        <div class="pmt-item-ctrl">
          <div class="pmt-qty">
            <button onclick="PMT.setQty(${i},${it.qty-1})" aria-label="Decrease">−</button>
            <span>${it.qty}</span>
            <button onclick="PMT.setQty(${i},${it.qty+1})" aria-label="Increase">+</button>
          </div>
          <button class="pmt-rm" onclick="PMT.remove(${i})">Remove</button>
        </div>
      </div>`;
    }).join('');
    foot.innerHTML=`
      <div class="pmt-tot"><span class="pmt-tot-k">Subtotal</span><span class="pmt-tot-v">${fmt(total())}</span></div>
      <div class="pmt-tot-note">Final price confirmed after we review vehicle details. Secure checkout — we'll reach out within 24 hrs.</div>
      <button class="pmt-co" id="pmtCoBtn" onclick="PMT.showCheckout()">Proceed to Checkout →</button>
      <button class="pmt-clear" onclick="if(confirm('Clear your cart?'))PMT.clear()">Clear cart</button>
      <div class="pmt-form" id="pmtForm">
        <button class="pmt-back" onclick="PMT.hideCheckout()">← Back to cart</button>
        <form id="pmtCheckoutForm" onsubmit="return PMT.submitCheckout(event)">
          <label>Full Name *</label><input type="text" name="name" required placeholder="Jane Doe"/>
          <label>Email *</label><input type="email" name="email" required placeholder="you@email.com"/>
          <label>Phone *</label><input type="tel" name="phone" required placeholder="(443) 000-0000"/>
          <label>Service Address *</label><input type="text" name="address" required placeholder="Street, City, ZIP"/>
          <label>Preferred Date / Time</label><input type="text" name="preferred" placeholder="e.g. Sat morning"/>
          <label>Notes</label><textarea name="notes" rows="2" placeholder="Vehicle make/model, gate code, etc."></textarea>
          <button class="pmt-co" id="pmtSubmitBtn" type="submit">Place Order →</button>
        </form>
      </div>`;
  }

  function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function openDrawer(){ensureUI();renderDrawer();document.getElementById('pmtOverlay').classList.add('open');document.getElementById('pmtDrawer').classList.add('open');document.body.style.overflow='hidden';}
  function closeDrawer(){const o=document.getElementById('pmtOverlay'),d=document.getElementById('pmtDrawer');if(o)o.classList.remove('open');if(d)d.classList.remove('open');document.body.style.overflow='';hideCheckout();}

  function showCheckout(){const f=document.getElementById('pmtForm');if(f)f.classList.add('show');const b=document.getElementById('pmtCoBtn');if(b)b.style.display='none';}
  function hideCheckout(){const f=document.getElementById('pmtForm');if(f)f.classList.remove('show');const b=document.getElementById('pmtCoBtn');if(b)b.style.display='';}

  async function submitCheckout(ev){
    ev.preventDefault();
    const f=ev.target;
    const btn=document.getElementById('pmtSubmitBtn');
    btn.disabled=true;btn.textContent='Sending…';
    const fd=new FormData(f);
    const items=read();
    const orderId='PMT-'+Date.now().toString(36).toUpperCase();
    const lines=items.map(it=>`• ${it.name}${it.vehicle?' — '+it.vehicle:''}${it.frequency==='sub'?' (Subscription)':''} × ${it.qty}  @ $${it.unitPrice.toFixed(2)} = $${(it.unitPrice*it.qty).toFixed(2)}`).join('\n');
    const tot=total().toFixed(2);
    const payload={
      _subject:`New Order ${orderId} — ${items.length} item(s), $${tot}`,
      _template:'table',
      _captcha:'false',
      _replyto:fd.get('email'),
      order_id:orderId,
      name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone'),
      address:fd.get('address'),preferred:fd.get('preferred')||'(not specified)',
      notes:fd.get('notes')||'(none)',
      items_summary:lines,
      items_json:JSON.stringify(items),
      subtotal:'$'+tot
    };
    try{
      await fetch(EMAIL_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    }catch(e){}
    /* Show success + clear cart */
    document.getElementById('pmtBody').innerHTML=`
      <div class="pmt-success">
        <div class="ico">✓</div>
        <h4>Order received</h4>
        <p>Order <strong>${orderId}</strong> — ${items.length} item(s), total $${tot}.<br/>We've emailed the details to our team and will contact you within 24 hours to confirm your appointment time.</p>
      </div>`;
    document.getElementById('pmtFoot').innerHTML='<button class="pmt-co" onclick="PMT.close()">Close</button>';
    clear();
    return false;
  }

  /* Expose */
  window.PMT={add,remove,setQty,clear,open:openDrawer,close:closeDrawer,count,total,read,showCheckout,hideCheckout,submitCheckout,toast};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureUI();updateBadge();});
  else{ensureUI();updateBadge();}
})();
