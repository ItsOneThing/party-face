const link=document.getElementById('footer-admin');
// Relative links stay within the project path; participant access keys are not forwarded.
link.href=['http://127.0.0.1:8765','http://localhost:8765'].includes(location.origin)?'admin.html':'online-admin.html';
link.textContent=new URLSearchParams(location.search).get('lang')==='it'?'Area amministratori':'管理后台';
