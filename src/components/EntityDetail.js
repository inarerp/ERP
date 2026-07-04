function EntityDetail({ entityId, onBack }) {
  const [entity, setEntity] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: e },{ data: d }] = await Promise.all([
      sb.from('entities').select('*').eq('id', entityId).single(),
      sb.from('deals').select('*, clients(name)').eq('entity_id', entityId).order('created_at',{ascending:false}),
    ]);
    setEntity(e); setDeals(d||[]); setLoading(false);
  },[entityId]);
  useEffect(()=>{ load(); },[load]);

  if (loading) return <Loading/>;
  if (!entity) return null;

  const totalValue = deals.reduce((a,d)=>a+Number(d.value||0),0);
  const totalProfit = deals.reduce((a,d)=>a+Number(d.actual_profit||d.expected_profit||0),0);
  const openDeals = deals.filter(d=>!['closed','cancelled','fully_collected'].includes(d.status));
  const taxDue = deals.filter(d=>d.tax_applicable && d.tax_status!=='paid').reduce((a,d)=>a+Number(d.tax_expected||0),0);

  return (
    <div className="content">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="topbar-btn btn-ghost" onClick={onBack}>← رجوع</button>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:3}}>
            <div className="avatar" style={{width:40,height:40,fontSize:18}}>{entity.name[0]}</div>
            <div>
              <div style={{fontSize:18,fontWeight:700}}>{entity.name}</div>
              <span className="badge badge-blue" style={{fontSize:11}}>{entity.type==='company'?'شركة':'فرد'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">إجمالي العمليات</div><div className="stat-value blue">{deals.length}</div><div className="stat-sub">مفتوح: {openDeals.length}</div></div>
        <div className="stat-card">
          <div className="stat-label">إجمالي قيمة العمليات</div>
          <div className="stat-value">{fmtShort(totalValue)}</div>
        </div>
        <StatCard label="الأرباح" valueClass="green" value={fmtShort(totalProfit)}/>
        <StatCard label="الضرائب المستحقة" valueClass="amber" value={fmtShort(taxDue)} sub="على عمليات هذا الكيان فقط"/>
      </div>

      <div className="section">
        <div className="section-header"><span className="section-title">عمليات {entity.name}</span></div>
        {deals.length===0
          ? <Empty icon="📋" title="لا توجد عمليات"/>
          : <table className="table">
              <thead><tr><th>الرقم</th><th>الاسم</th><th>العميل</th><th>القيمة</th><th>الضريبة</th><th>الحالة</th></tr></thead>
              <tbody>{deals.map(d=>(
                <tr key={d.id}>
                  <td style={{fontFamily:'monospace',fontSize:12,color:'var(--text2)'}}>{d.deal_number}</td>
                  <td style={{fontWeight:600}}>{d.name}</td>
                  <td>{d.clients?.name||'—'}</td>
                  <td>{fmt(d.value)}</td>
                  <td>{d.tax_applicable ? <span className="badge badge-amber">ضريبي — {fmt(d.tax_expected)}</span> : <span className="badge badge-gray">غير ضريبي</span>}</td>
                  <td><span className={`badge ${(STATUS_MAP[d.status]||{cls:'badge-gray'}).cls}`}>{(STATUS_MAP[d.status]||{label:'—'}).label}</span></td>
                </tr>
              ))}</tbody>
            </table>}
      </div>
    </div>
  );
}
