import{a as e}from"./rolldown-runtime-B0Z9INg1.js";import{g as t}from"./vendor-core-Cv0p2dBW.js";import{at as n}from"./index-ZlgiVmC8.js";var r=e(t(),1),i=`screen-protection-enabled`;function a(){try{let e=localStorage.getItem(i);return e===null||e===`true`}catch{return!0}}function o(){let{user:e}=n(),[t,o]=(0,r.useState)(a),c=(0,r.useCallback)(()=>{o(e=>{let t=!e;return localStorage.setItem(i,String(t)),window.dispatchEvent(new Event(`screen-protection-change`)),t})},[]);return(0,r.useEffect)(()=>{let e=()=>o(a());return window.addEventListener(`screen-protection-change`,e),()=>window.removeEventListener(`screen-protection-change`,e)},[]),(0,r.useEffect)(()=>{if(!t)return;let e=e=>{if(e.key===`PrintScreen`){e.preventDefault(),navigator.clipboard?.writeText?.(``).catch(()=>{}),s();return}if(e.metaKey&&e.shiftKey&&[`3`,`4`,`5`].includes(e.key)){e.preventDefault(),s();return}if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()===`s`){e.preventDefault(),s();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`p`){e.preventDefault(),s();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`s`){e.preventDefault(),s();return}let t=e.target,n=t.tagName===`INPUT`||t.tagName===`TEXTAREA`||t.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`c`&&!n){e.preventDefault(),navigator.clipboard?.writeText?.(``).catch(()=>{}),s();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`a`&&!n){e.preventDefault();return}if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()===`i`){e.preventDefault();return}if(e.key===`F12`){e.preventDefault();return}},n=e=>{e.preventDefault()},r=e=>{let t=e.target;t.tagName===`INPUT`||t.tagName===`TEXTAREA`||t.isContentEditable||(e.preventDefault(),e.clipboardData?.setData(`text/plain`,``))},i=e=>{let t=e.target;t.tagName!==`INPUT`&&t.tagName!==`TEXTAREA`&&e.preventDefault()},a=null,o=()=>{a||(a=document.createElement(`div`),a.id=`screen-protection-overlay`,a.style.cssText=`
        position: fixed; inset: 0; z-index: 99999;
        background: hsl(var(--background));
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(20px);
        transition: opacity 0.2s ease;
      `,a.innerHTML=`
        <div style="text-align:center; color: hsl(var(--foreground)); font-family: var(--font-sans);">
          <div style="font-size:3rem; margin-bottom:1rem;">🔒</div>
          <div style="font-size:1.25rem; font-weight:600;">Conteúdo Protegido</div>
          <div style="font-size:0.875rem; opacity:0.7; margin-top:0.5rem;">Volte à janela para continuar</div>
        </div>
      `,document.body.appendChild(a))},c=()=>{a&&=(a.remove(),null)},l=document.createElement(`style`);return l.id=`screen-protection-css`,l.textContent=`
      @media print { body { display: none !important; } }
      body { -webkit-user-select: none !important; user-select: none !important; }
      input, textarea, [contenteditable="true"], pre, code { -webkit-user-select: text !important; user-select: text !important; }
      img { -webkit-user-drag: none !important; user-drag: none !important; pointer-events: auto; }
    `,document.head.appendChild(l),document.addEventListener(`keydown`,e,!0),document.addEventListener(`contextmenu`,n),document.addEventListener(`copy`,r,!0),document.addEventListener(`dragstart`,i,!0),window.addEventListener(`blur`,o),window.addEventListener(`focus`,c),()=>{document.removeEventListener(`keydown`,e,!0),document.removeEventListener(`contextmenu`,n),document.removeEventListener(`copy`,r,!0),document.removeEventListener(`dragstart`,i,!0),window.removeEventListener(`blur`,o),window.removeEventListener(`focus`,c),a?.remove(),l.remove()}},[e,t]),{enabled:t,toggle:c}}function s(){let e=document.createElement(`div`);e.style.cssText=`
    position: fixed; inset: 0; z-index: 99999;
    background: hsl(var(--destructive) / 0.15);
    pointer-events: none;
    animation: screenFlash 0.5s ease-out forwards;
  `;let t=document.createElement(`style`);t.textContent=`
    @keyframes screenFlash {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
  `,document.head.appendChild(t),document.body.appendChild(e),setTimeout(()=>{e.remove(),t.remove()},600)}export{o as useScreenProtection};