

async function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}


function zipNameFromExisting(existingName) {
  const base = existingName.replace(/\.(json|mp4|webm)$/i, '');
  return `${base}.zip`;
}

export {downloadBlob,zipNameFromExisting};