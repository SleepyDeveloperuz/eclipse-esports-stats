document.getElementById('pwaRetry').addEventListener('click', () => window.location.reload());
window.addEventListener('online', () => {
  document.getElementById('pwaOfflineStatus').textContent = 'Aloqa qaytdi. Davom etish uchun “Qayta urinish”ni bosing.';
});
