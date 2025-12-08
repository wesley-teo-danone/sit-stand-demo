function setPhaseLabel(text, align = 'left'){
  const pill = document.getElementById('phasePill');
  const span = document.getElementById('phaseText');
  if (!pill || !span) return;

  if (span.textContent !== text){
    span.textContent = text;
    pill.classList.remove('bump');
    requestAnimationFrame(()=> pill.classList.add('bump'));
  }
  pill.classList.toggle('tc', align === 'center');
  pill.classList.toggle('tl', align !== 'center');
}
function setPillVisible(visible){
  const pill = document.getElementById('phasePill');
  if (!pill) return;
  pill.classList.toggle('is-hidden', !visible);
  pill.setAttribute('aria-hidden', String(!visible)); // good a11y
}

// convenience wrappers
function showPill(){ setPillVisible(true); }
function hidePill(){ setPillVisible(false); }



export{setPhaseLabel,showPill,hidePill};