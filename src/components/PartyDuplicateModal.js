function PartyDuplicateModal({ matches, onAddRole, onCreateNew, onCancel, roleName }) {
  return (
    <div className="modal-overlay" style={{zIndex:1100}}>
      <div className="modal" style={{maxWidth:480}}>
        <div className="modal-header">
          <span className="modal-title">⚠️ طرف موجود بالفعل</span>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{fontSize:13,color:'var(--text2)',marginBottom:14}}>
            وجدنا {matches.length > 1 ? `${matches.length} أطراف مشابهة` : 'طرفاً مشابهاً'} في النظام.
            هل تريد إضافة دور <strong>{roleName}</strong> لأحدهم بدلاً من إنشاء Profile جديد؟
          </div>
          {matches.map(m => (
            <div key={m.id} style={{
              padding:'10px 14px', marginBottom:8, borderRadius:8,
              border:'1px solid var(--border)', background:'var(--bg3)',
              display:'flex', justifyContent:'space-between', alignItems:'center'
            }}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{m.name}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                  {m.phone||''}{m.phone&&m.email?' · ':''}{m.email||''}
                  {m.roles?.length ? <span style={{marginRight:6}}>({m.roles.join(', ')})</span> : ''}
                </div>
              </div>
              <button
                className="topbar-btn btn-primary"
                style={{fontSize:12,padding:'5px 12px'}}
                onClick={() => onAddRole(m)}
              >
                إضافة دور
              </button>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="topbar-btn btn-ghost" onClick={onCancel}>إلغاء</button>
          <button className="topbar-btn" style={{background:'var(--bg3)',color:'var(--text)'}} onClick={onCreateNew}>
            إنشاء Profile جديد
          </button>
        </div>
      </div>
    </div>
  );
}
