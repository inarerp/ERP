// ── Developer Tools (مخفية — وصول عبر #devtools فقط، غير مدرجة في القائمة) ──
function DeveloperTools() {
  const CONFIRM_PHRASE = 'RESET_ALL_DEMO_DATA';
  const [confirmText, setConfirmText] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const canConfirm = confirmText.trim() === CONFIRM_PHRASE;

  const runReset = async () => {
    if (!canConfirm || running) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await sb.rpc('dev_reset_operational_data', {
        p_confirm: confirmText.trim(),
      });
      if (error) throw error;
      setResult({ ok: true, data });
      setConfirmModal(false);
      setConfirmText('');
    } catch (err) {
      setResult({ ok: false, message: err.message || String(err) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="content">
      <div style={{
        background: 'rgba(239,68,68,.08)', border: '2px solid rgba(239,68,68,.4)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
          ⚠️ أداة مطوّرين — ليست جزءاً من النظام الفعلي
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          هذه الشاشة مخصصة للتطوير والاختبار فقط. أي عملية هنا قد تكون <strong>غير قابلة للتراجع</strong>.
          لا تستخدمها على بيانات حقيقية أو إنتاجية.
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">تصفير البيانات التشغيلية (Reset Demo Data)</span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
                🗑️ سيتم حذفه بالكامل
              </div>
              <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, paddingRight: 18, margin: 0 }}>
                <li>العمليات (Deals) وكل ما يرتبط بها</li>
                <li>تخصيصات الممولين والوسطاء</li>
                <li>التحصيلات والمصروفات والدفعات</li>
                <li>توزيعات الأرباح ودورات الربح</li>
                <li>أوامر التوريد والشيكات</li>
                <li>الحركات المالية وكشوف حساب الممولين</li>
                <li>السجل الزمني (Timeline) والمرفقات</li>
                <li>سجل التدقيق (Audit Log)</li>
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
                ✅ سيبقى كما هو
              </div>
              <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, paddingRight: 18, margin: 0 }}>
                <li>الأطراف (Parties) وكل أدوارها</li>
                <li>الممولون والكيانات والعملاء والوسطاء (كسجلات هوية)</li>
                <li>المستخدمون (Users)</li>
                <li>فئات الحركات المالية (Reference Data)</li>
                <li>الحسابات (كأسماء) — <strong>لكن أرصدتها تُصفَّر لـ 0</strong></li>
              </ul>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                ملاحظة: أرصدة الممولين والوسطاء (متاح/عامل/محجوز/مستحق) تُصفَّر أيضاً —
                لأنها أرقام مشتقة من العمليات المحذوفة ولا معنى لبقائها.
              </div>
            </div>
          </div>

          <button
            className="topbar-btn"
            style={{ background: 'var(--red)', color: 'white' }}
            onClick={() => setConfirmModal(true)}
          >
            حذف كل البيانات التشغيلية التجريبية
          </button>

          {result && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 8, fontSize: 13,
              background: result.ok ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
              border: `1px solid ${result.ok ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
              color: result.ok ? 'var(--green)' : 'var(--red)',
            }}>
              {result.ok ? (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>✅ تم التصفير بنجاح</div>
                  <pre style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(result.data?.counts || {}, null, 2)}
                  </pre>
                </>
              ) : (
                <>❌ فشل: {result.message}</>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--red)' }}>تأكيد نهائي — عملية غير قابلة للتراجع</span>
              <button className="modal-close" onClick={() => setConfirmModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
                هل أنت متأكد أنك تريد حذف كل البيانات التشغيلية التجريبية؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.
                للتأكيد، اكتب العبارة التالية بالضبط:
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 13, background: 'var(--bg3)',
                padding: '8px 12px', borderRadius: 6, marginBottom: 12, textAlign: 'center',
                userSelect: 'all',
              }}>
                {CONFIRM_PHRASE}
              </div>
              <input
                className="form-input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="اكتب العبارة هنا..."
                style={{ fontFamily: 'monospace', textAlign: 'center' }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="topbar-btn btn-ghost" onClick={() => setConfirmModal(false)}>إلغاء</button>
              <button
                className="topbar-btn"
                style={{ background: canConfirm ? 'var(--red)' : 'var(--bg3)', color: canConfirm ? 'white' : 'var(--text3)' }}
                onClick={runReset}
                disabled={!canConfirm || running}
              >
                {running ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
