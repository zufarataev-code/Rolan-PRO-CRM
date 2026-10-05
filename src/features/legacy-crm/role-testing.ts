/** Owner role audit uses the existing employee preview session, never local impersonation. */
export const ROLE_TESTING_HTML = String.raw`
<style>
.rp-role-test-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.rp-role-test-card { border:1px solid #DCE5EE; padding:16px; min-width:0; }
.rp-role-test-card h4 { margin-bottom:12px; font-weight:700; }
.rp-role-test-card select { width:100%; min-height:44px; margin-bottom:10px; }
.rp-role-test-card button { width:100%; min-height:44px; }
#rolanpro-preview-bar { flex-wrap:wrap; }
#rolanpro-preview-bar button { min-height:36px; }
@media(max-width:520px) { .rp-role-test-grid { grid-template-columns:1fr; } #rolanpro-preview-bar span { flex:1 1 100%; font-size:12px; } }
</style>
<script>
(() => {
  const roles = [['OWNER','Владелец'],['MANAGER','Менеджер'],['CONSULTANT','Замерщик'],['INSTALLER','Установщик']];
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let generation = 0;
  window.openRoleTesting = async function() {
    const currentGeneration = ++generation;
    state.modal = '<div class="modal-backdrop"><div class="modal-content p-6"><h3 class="font-bold text-lg">Проверка ролей</h3><p class="mt-3">Загрузка сотрудников…</p><button class="btn-ghost mt-4" onclick="closeModal()">Закрыть</button></div></div>';
    render();
    try {
      const response = await fetch('/api/v1/team/preview', { cache:'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.errors?.[0]?.message || 'Не удалось загрузить роли');
      const employees = payload.data.employees || [];
      if (currentGeneration !== generation || !String(state.modal || '').includes('Загрузка сотрудников…')) return;
      const cards = roles.map(([code,label]) => {
        if(code === 'OWNER') return '<section class="rp-role-test-card"><h4>Владелец</h4><p class="text-sm mb-3">Все показатели и настройки компании</p><button class="btn-primary" onclick="leaveRoleTesting()">Вернуться к владельцу</button></section>';
        const users = employees.filter(user => (user.roles || []).includes(code));
        return '<section class="rp-role-test-card"><h4>'+label+'</h4><select id="rp-test-'+code+'" aria-label="Сотрудник: '+label+'">'+(users.length ? users.map(user => '<option value="'+esc(user.userId)+'">'+esc(user.fullName)+'</option>').join('') : '<option>Нет активных сотрудников с этой ролью</option>')+'</select><button class="btn-primary" '+(users.length?'':'disabled')+' onclick="startRoleTesting(\''+code+'\')">Открыть роль</button></section>';
      }).join('');
      state.modal = '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-content p-6" style="max-width:48rem"><div class="flex justify-between gap-3 mb-4"><h3 class="font-bold text-lg">Проверка ролей</h3><button class="btn-ghost" onclick="closeModal()">Закрыть</button></div><p class="text-sm mb-4">Выберите сотрудника, чтобы проверить его интерфейс и расчёты. Просмотр без сохранения изменений.</p><div class="rp-role-test-grid">'+cards+'</div></div></div>';
      render();
    } catch(error) { if (currentGeneration === generation && String(state.modal || '').includes('Загрузка сотрудников…')) { state.modal = '<div class="modal-backdrop"><div class="modal-content p-6"><h3>Проверка ролей</h3><p>'+esc(error.message)+'</p><button class="btn-ghost mt-3" onclick="closeModal()">Закрыть</button></div></div>';render(); } }
  };
  window.startRoleTesting = async function(role) {
    const userId = document.getElementById('rp-test-'+role)?.value;
    if(!userId) return;
    try {
    const response = await fetch('/api/v1/team/preview', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,role}) });
    const payload = await response.json();
    if(!response.ok) return alert(payload.errors?.[0]?.message || 'Не удалось открыть роль');
    location.assign(payload.data.redirectTo || '/legacy-crm');
    } catch(error) { alert('Не удалось открыть роль. Повторите попытку.'); }
  };
  window.leaveRoleTesting = async function() {
    try {
    const response = await fetch('/api/v1/team/preview', {method:'DELETE'});
    if(response.ok) location.assign('/legacy-crm?view=owner&v='+Date.now()+'#/overview');
    else alert('Не удалось выйти из просмотра. Повторите попытку.');
    } catch(error) { alert('Не удалось выйти из просмотра. Повторите попытку.'); }
  };
  const bar = document.getElementById('rolanpro-preview-bar');
  if(bar) { const resize = () => document.body.style.setProperty('padding-top',bar.offsetHeight+'px','important'); resize(); new ResizeObserver(resize).observe(bar); }
})();
</script>`;
