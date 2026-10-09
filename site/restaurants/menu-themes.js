/* Guest-menu design and access rules. Previewing never writes restaurant data. */
(function(root){
'use strict';
const themes=[
 {id:'glass-bistro',name:'Daily Menu',type:'Bistro',description:'A photo header, clean category cards and a crisp, easy-to-read menu.',accent:'#ef997c',font:'DM Sans',badge:'Included · Default',premium:false},
 {id:'garden',name:'Garden Cards',type:'Vegetarian / Vegan',description:'Sage green, generous photography and a spacious two-column food gallery.',accent:'#678669',font:'Manrope',badge:'Theme add-on',premium:true},
 {id:'midnight',name:'Evening Edition',type:'Fine Dining',description:'Ink and champagne, an editorial welcome and refined dining lists.',accent:'#c7ad76',font:'Cormorant Garamond',badge:'Theme add-on',premium:true},
 {id:'cafe',name:'Café Journal',type:'Cafe / Bakery',description:'Warm paper, expressive serif headings and a cosy café menu layout.',accent:'#a97a5b',font:'Fraunces',badge:'Theme add-on',premium:true}
];
const defaultTheme='glass-bistro';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function imageURL(value){try{if(/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value||''))return value;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function webURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function access(rows,venueId){return [defaultTheme,...themes.filter(t=>t.premium&&rows?.some(r=>r.venue_id===venueId&&r.kind==='addon'&&r.status==='completed'&&r.service_name==='guest-theme:'+t.id)).map(t=>t.id)];}
function resolve(theme,allowed=[defaultTheme]){return themes.some(t=>t.id===theme)&&allowed.includes(theme)?theme:defaultTheme;}
function money(value,currency){try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:currency||'INR',maximumFractionDigits:2}).format(Number(value)||0);}catch{return String(Number(value)||0);}}
function categoryCards(v){
 const menu=Array.isArray(v.menu)?v.menu:[];
 const cats=[...new Set(menu.map(x=>x.category||'Menu'))];
 return '<div class="guest-categories">'+cats.map((name,i)=>{
 const dishes=menu.filter(x=>(x.category||'Menu')===name),image=dishes.map(d=>imageURL(d.image)).find(Boolean);
 return '<button type="button" class="menu-category-card" data-category="'+E(name)+'" data-category-search="'+E([name,...dishes.map(d=>d.name+' '+d.description)].join(' ').toLowerCase())+'">'+(image?'<img src="'+E(image)+'" alt="" loading="lazy">':'<span class="menu-category-placeholder" aria-hidden="true"><span>'+String(i+1).padStart(2,'0')+'</span></span>')+'<span class="menu-category-copy"><b>'+E(name)+'</b><small>'+dishes.length+' '+(dishes.length===1?'dish':'dishes')+'</small></span><span class="menu-category-arrow" aria-hidden="true">↗</span></button>';
 }).join('')+'</div>';
}
function home(v){
 const review=webURL(v.google_url),logo=imageURL(v.logo_url);
 return '<header class="menu-brand">'+(logo?'<img class="menu-brand-logo" src="'+E(logo)+'" alt="'+E(v.name)+' logo">':'')+'<span class="menu-kicker">WELCOME TO THE TABLE</span><h1>'+E(v.name)+'</h1><p class="menu-tagline">'+E(v.tagline)+'</p>'+(v.address?'<p class="menu-location">'+E(v.address)+'</p>':'')+'</header><nav class="guest-services" aria-label="Restaurant services"><button type="button" data-guest="menu">Full menu</button>'+(v.wifi_enabled?'<button type="button" data-guest="wifi">Wi-Fi</button>':'')+(v.loyalty_enabled?'<button type="button" data-guest="loyalty">Rewards</button>':'')+'<button type="button" data-guest="feedback">Feedback</button>'+(review?'<a data-track="review" href="'+E(review)+'" target="_blank" rel="noopener noreferrer">Google review ↗</a>':'')+'</nav><div class="menu-section-heading"><div><span class="menu-kicker">FRESH FROM OUR KITCHEN</span><h2>Explore the menu.</h2></div><span class="menu-section-number">'+String((v.menu||[]).length).padStart(2,'0')+' dishes</span></div><label class="category-search-label"><span class="sr-only">Search menu categories</span><input id="category-search" type="search" placeholder="Search dishes or categories" aria-label="Search dishes or categories"></label>'+categoryCards(v)+((v.menu||[]).length?'':'<p class="menu-empty">The kitchen is preparing its menu. Please ask your server for today’s dishes.</p>')+'<p class="category-empty" hidden>No matching dishes or categories. Try another search.</p>';
}
function row(i,currency){
 const image=imageURL(i.image);
 return '<article class="menu-item" data-search="'+E([i.name,i.description,i.category,i.diet,i.allergens].join(' ').toLowerCase())+'"><div class="menu-item-copy"><h3>'+E(i.name)+'</h3><p>'+E(i.description)+'</p><div class="menu-item-meta">'+(i.diet?'<span class="diet">'+E(i.diet)+'</span>':'')+(i.available===false?'<span class="menu-sold-out">Sold out today</span>':'<b>'+E(money(i.price,currency))+'</b>')+'</div>'+(i.allergens?'<span class="allergens">Allergens: '+E(i.allergens)+'</span>':'')+'</div>'+(image?'<img src="'+E(image)+'" alt="'+E(i.name)+'" loading="lazy">':'')+'</article>';
}
function previewDocument(v,id){
 const theme=themes.find(t=>t.id===id)||themes[0],cover=imageURL(v.cover_url);
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/restaurants/menu-themes.css"><title>'+E(theme.name)+' preview</title></head><body class="restaurant-app menu-theme-preview" data-guest-theme="'+theme.id+'"><main class="guest guest-home"><div class="guest-cover">'+(cover?'<img src="'+E(cover)+'" alt="">':'<div class="menu-cover-placeholder"><span>YOUR MENU. YOUR MOMENT.</span></div>')+'</div><div class="guest-body"><div class="guest-preview-label">DESIGN PREVIEW · '+E(theme.name)+'</div>'+home(v)+'<section class="preview-menu-list"><h2>A taste of the menu.</h2>'+((v.menu||[]).slice(0,8).map(i=>row(i,v.currency)).join(''))+'</section><p class="guest-footer">Preview only · No changes to your restaurant</p></div></main></body></html>';
}
const api={themes,defaultTheme,access,resolve,home,row,categoryCards,previewDocument};
root.GuestMenuThemes=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
