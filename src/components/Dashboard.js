function Dashboard({ navigateSub, navigate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today   = new Date(); today.setHours(0,0,0,0);
      const in3     = new Date(today); in3.setDate(today.getDate()+3);
      const in7     = new Date(today); in7.setDate(today.getDate()+7);
      const todayS  = today.toISOString().slice(0,10);
      const in3S    = in3.toISOString().slice(0,10);
      const in7S    = in7.toISOString().slice(0,10);

      const [
        { data: deals },
        { data: inv },
        { data: brk },
        { data: cheqs },
        { data: dists },
      ] = await Promise.all([
        sb.from('deals').select('id,deal_number,name,status,due_date,value,entities(name)').not('status','in','(\"closed\",\"cancelled\")').order('due_date',{ascending:true}).limit(100),
        sb.from('investors').select('available_balance,working_balance,profit_due,profit_paid'),
        sb.from('brokers').select('commission_due,commission_paid'),
        sb.from('cheques').select('id,cheque_number,amount,due_date,bank,status').not('status','in','(\"collected\",\"cancelled\")').lte('due_date',in7S).order('due_date'),
        sb.from('profit_distributions').select('id,amount,deal_id,beneficiary_name_snapshot').eq('is_paid',false),
      ]);

      const allDeals   = deals||[];
      const overdueD   = allDeals.filter(d=>d.due_date&&d.due_date<todayS);
      const urgentD    = allDeals.filter(d=>d.due_date&&d.due_date>=todayS&&d.due_date<=in3S);
      const soonD      = allDeals.filter(d=>d.due_date&&d.due_date>in3S&&d.due_date<=in7S);
      const noFunding  = allDeals.filter(d=>['studying','funded'].includes(d.status));
      const overdueChq = (cheqs||[]).filter(c=>c.due_date&&c.due_date<todayS);
      const urgentChq  = (cheqs||[]).filter(c=>c.due_date&&c.due_date>=todayS&&c.due_date<=in3S);

      const invBal   = (inv||[]).reduce((a,x)=>a+Number(x.available_balance||0),0);
      const invWork  = (inv||[]).reduce((a,x)=>a+Number(x.working_balance||0),0);
      const invProfit= (inv||[]).reduce((a,x)=>a+Number(x.profit_due||0)-Number(x.profit_paid||0),0);
      const brkDue   = (brk||[]).reduce((a,x)=>a+Number(x.commission_due||0)-Number(x.commission_paid||0),0);
      const pendingDist = (dists||[]).reduce((a,x)=>a+Number(x.amount||0),0);

      setData({
        overdueD, urgentD, soonD, noFunding,
        overdueChq, urgentChq,
        invBal, invWork, invProfit, brkDue, pendingDist,
        activeDeals: allDeals.filter(d=>!['studying'].includes(d.status)),
        dists: dists||[],
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Loading/>;

  const daysLabel = (dateStr) => {
    const today=new Date(); today.setHours(0,0,0,0);
    const due=new Date(dateStr); due.setHours(0,0,0,0);
    const diff=Math.round((due-today)/86400000);
    if(diff<0)  return {text:`متأخر ${Math.abs(diff)} يوم`,color:'var(--red)'};
    if(diff===0)return {text:'اليوم!',color:'var(--red)'};
    if(diff<=3) return {text:`${diff} أيام`,color:'var(--red)'};
    return {text:`${diff} يوم`,color:'var(--amber)'};
  };

  const { overdueD,urgentD,soonD,noFunding,overdueChq,urgentChq,
          invBal,invWork,invProfit,brkDue,pendingDist,activeDeals,dists } = data;

  return (
    <div className="content">

      {/* ── KPI Strip ── */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
        <div className="kpi-card">
          <div className="kpi-label">رصيد متاح للممولين</div>
          <div className="kpi-value blue">{fmtShort(invBal)}</div>
          <div className="kpi-delta" style={{color:'var(--text3)'}}>عامل: {fmtShort(invWork)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">عمليات نشطة</div>
          <div className="kpi-value">{activeDeals.length}</div>
          <div className="kpi-delta" style={{color:'var(--text3)'}}>تحت الدراسة: {noFunding.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">أرباح معلقة للممولين</div>
          <div className="kpi-value amber">{fmtShort(invProfit)}</div>
          <div className="kpi-delta" style={{color:'var(--text3)'}}>عمولات: {fmtShort(brkDue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">توزيعات غير مدفوعة</div>
          <div className="kpi-value" style={{color:pendingDist>0?'var(--amber)':'var(--green)'}}>{fmtShort(pendingDist)}</div>
          <div className="kpi-delta" style={{color:'var(--text3)'}}>{dists.length} توزيع معلق</div>
        </div>
      </div>

      {/* ── Action Cards ── */}
      <div className="action-center">

        {/* عمليات متأخرة */}
        <div className={`action-card ${overdueD.length>0?'action-card-urgent':'action-card-ok'}`}>
          <div className="action-card-title">🚨 عمليات متأخرة</div>
          <div className="action-card-value" style={{color:overdueD.length>0?'var(--red)':'var(--green)'}}>
            {overdueD.length}
          </div>
          <div className="action-card-sub">{overdueD.length===0?'لا توجد تأخيرات ✓':'تستحق متابعة فورية'}</div>
          {overdueD.length>0&&<div className="action-card-items">
            {overdueD.slice(0,3).map(d=>(
              <div key={d.id} className="action-item" onClick={()=>navigateSub('deals',d.id)}>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <span className="priority-dot" style={{background:'var(--red)'}}/>
                  <span style={{fontWeight:600}}>{d.deal_number}</span>
                  <span style={{color:'var(--text2)'}}>{d.name}</span>
                </span>
                <span style={{color:'var(--red)',fontWeight:700,fontSize:11}}>{daysLabel(d.due_date).text}</span>
              </div>
            ))}
            {overdueD.length>3&&<div style={{fontSize:11,color:'var(--text3)',padding:'4px 8px'}}>+{overdueD.length-3} أخرى</div>}
          </div>}
        </div>

        {/* شيكات مستحقة */}
        <div className={`action-card ${overdueChq.length>0?'action-card-urgent':urgentChq.length>0?'action-card-warn':'action-card-ok'}`}>
          <div className="action-card-title">🧾 شيكات مستحقة</div>
          <div className="action-card-value" style={{color:overdueChq.length>0?'var(--red)':urgentChq.length>0?'var(--amber)':'var(--green)'}}>
            {overdueChq.length+urgentChq.length}
          </div>
          <div className="action-card-sub">
            {overdueChq.length>0?`${overdueChq.length} متأخر`:urgentChq.length>0?`${urgentChq.length} خلال 3 أيام`:'لا شيكات مستحقة ✓'}
          </div>
          {(overdueChq.concat(urgentChq)).length>0&&<div className="action-card-items">
            {overdueChq.concat(urgentChq).slice(0,3).map(c=>(
              <div key={c.id} className="action-item" onClick={()=>navigate&&navigate('cheques')}>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <span className="priority-dot" style={{background:overdueChq.includes(c)?'var(--red)':'var(--amber)'}}/>
                  <span style={{color:'var(--text2)'}}>{c.cheque_number||'شيك'} — {c.bank||''}</span>
                </span>
                <span style={{fontWeight:600,color:'var(--green)',fontSize:11}}>{fmtShort(c.amount)}</span>
              </div>
            ))}
          </div>}
        </div>

        {/* عمليات تستحق قريباً */}
        <div className={`action-card ${urgentD.length>0?'action-card-warn':'action-card-info'}`}>
          <div className="action-card-title">📅 تستحق خلال 7 أيام</div>
          <div className="action-card-value" style={{color:urgentD.length>0?'var(--amber)':'var(--accent)'}}>
            {urgentD.length+soonD.length}
          </div>
          <div className="action-card-sub">{urgentD.length>0?`${urgentD.length} تستحق خلال 3 أيام`:soonD.length>0?`${soonD.length} خلال أسبوع`:'لا مواعيد قريبة'}</div>
          {urgentD.concat(soonD).length>0&&<div className="action-card-items">
            {urgentD.concat(soonD).slice(0,3).map(d=>(
              <div key={d.id} className="action-item" onClick={()=>navigateSub('deals',d.id)}>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <span className="priority-dot" style={{background:urgentD.includes(d)?'var(--amber)':'var(--accent)'}}/>
                  <span style={{fontWeight:600}}>{d.deal_number}</span>
                  <span style={{color:'var(--text2)',fontSize:11}}>{d.name}</span>
                </span>
                <span style={{color:urgentD.includes(d)?'var(--amber)':'var(--text3)',fontSize:11,fontWeight:600}}>{daysLabel(d.due_date).text}</span>
              </div>
            ))}
          </div>}
        </div>

        {/* توزيعات معلقة */}
        <div className={`action-card ${dists.length>0?'action-card-warn':'action-card-ok'}`}>
          <div className="action-card-title">💰 توزيعات أرباح معلقة</div>
          <div className="action-card-value" style={{color:dists.length>0?'var(--amber)':'var(--green)'}}>
            {dists.length}
          </div>
          <div className="action-card-sub">{dists.length===0?'جميع الأرباح موزعة ✓':`إجمالي: ${fmtShort(pendingDist)}`}</div>
          {dists.length>0&&<div className="action-card-items">
            {dists.slice(0,3).map((d,i)=>(
              <div key={d.id||i} className="action-item">
                <span style={{color:'var(--text2)',fontSize:11}}>{d.beneficiary_name_snapshot}</span>
                <span style={{fontWeight:600,color:'var(--amber)',fontSize:11}}>{fmtShort(d.amount)}</span>
              </div>
            ))}
          </div>}
        </div>

      </div>

      {/* ── آخر العمليات ── */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">العمليات النشطة</span>
          <button className="topbar-btn btn-primary" style={{fontSize:12}} onClick={()=>navigate&&navigate('deals')}>
            عرض الكل
          </button>
        </div>
        <div className="section-body">
          {activeDeals.length===0
            ? <Empty icon="📋" title="لا توجد عمليات نشطة"/>
            : <table className="table">
                <thead><tr>
                  <th>رقم العملية</th><th>الاسم</th><th>الكيان</th><th>القيمة</th><th>الحالة</th><th>الاستحقاق</th>
                </tr></thead>
                <tbody>{activeDeals.slice(0,8).map(d=>(
                  <tr key={d.id} style={{cursor:'pointer'}} onClick={()=>navigateSub('deals',d.id)}>
                    <td style={{color:'var(--text2)',fontFamily:'monospace',fontSize:12}}>{d.deal_number}</td>
                    <td style={{fontWeight:600}}>{d.name}</td>
                    <td style={{color:'var(--text2)'}}>{d.entities?.name||'—'}</td>
                    <td style={{color:'var(--green)'}}>{fmt(d.value)}</td>
                    <td><span className={`badge ${(STATUS_MAP[d.status]||{cls:'badge-gray'}).cls}`}>{(STATUS_MAP[d.status]||{label:d.status}).label}</span></td>
                    <td>{d.due_date
                      ? (()=>{const dl=daysLabel(d.due_date);return<span style={{fontSize:12,color:dl.color,fontWeight:600}}>{dl.text}</span>;})()
                      : <span style={{color:'var(--text3)',fontSize:12}}>—</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>
      </div>

    </div>
  );
}
