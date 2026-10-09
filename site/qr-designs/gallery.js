'use strict';
(function(){
 const buttons=[...document.querySelectorAll('[data-gallery-kind]')],host=document.querySelector('#design-gallery-host');
 function show(kind){
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.galleryKind===kind)));
  const restaurant=kind==='restaurant';
  window.QRDesigns.mount(host,{kind,id:restaurant?'restaurant-preview':'review-preview',code:'DESIGN PREVIEW',name:restaurant?'The Olive Table':'Your business name',url:restaurant?location.origin+'/restaurants/?venue=demo':location.origin+'/qr-designs/?sample=review',features:restaurant?['Menu','Guest Wi-Fi','Rewards','Feedback']:undefined});
 }
 buttons.forEach(b=>b.addEventListener('click',()=>show(b.dataset.galleryKind)));
 show(new URLSearchParams(location.search).get('sample')==='restaurant'?'restaurant':'review');
})();
