const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const toggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('.site-header nav');
toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav?.classList.toggle('is-open',open);});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{toggle?.setAttribute('aria-expanded','false');nav?.classList.remove('is-open');}));
if(!reduced&&'IntersectionObserver'in window){const observer=new IntersectionObserver(items=>items.forEach(item=>{if(item.isIntersecting){item.target.classList.add('is-visible');observer.unobserve(item.target);}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));}
if(!reduced&&matchMedia('(pointer:fine)').matches){document.querySelectorAll('[data-parallax]').forEach(el=>{el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.setProperty('--px',`${-x*5}px`);el.style.setProperty('--py',`${-y*4}px`);});el.addEventListener('pointerleave',()=>{el.style.setProperty('--px','0px');el.style.setProperty('--py','0px');});});}
const headline=document.querySelector('.motion-headline');
if(headline&&!reduced&&matchMedia('(hover:hover) and (pointer:fine)').matches){
 headline.addEventListener('pointermove',event=>{const r=headline.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;headline.style.setProperty('--tilt-x',`${-y*1.6}deg`);headline.style.setProperty('--tilt-y',`${x*1.8}deg`);headline.classList.add('is-hovered');});
 headline.addEventListener('pointerleave',()=>{headline.classList.remove('is-hovered');headline.style.setProperty('--tilt-x','0deg');headline.style.setProperty('--tilt-y','0deg');});
}
