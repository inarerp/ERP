function GlobalSearch({ navigateSub, navigate, onClose }) {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if(!q || q.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const term = q.trim().toLowerCase();
        const [
          { data: parties },
          { data: deals },
          { data: cheqs },
        ] = await Promise.all([
          sb.from('v_parties_unified').select('id,name,phone,email,is_investor,is_entity,is_broker,is_client').ilike('name', `%${term}%`).limit(5),
          sb.from('deals').select('id,deal_number,name,status').or(`name.ilike.%${term}%,deal_number.ilike.%${term}%`).limit(5),
          sb.from('cheques').select('id,cheque_number,amount,status').ilike('cheque_number', `%${term}%`).limit(3),
        ]);
        const r = [];
        (parties||[]).forEach(p => r.push({ type:'party', label:p.name, sub:p.phone||p.email||'', id:p.id, roles:[p.is_investor&&'ممول',p.is_entity&&'كيان',p.is_broker&&'وسيط',p.is_client&&'عميل'].filter(Boolean) }));
        (deals||[]).forEach(d   => r.push({ type:'deal',  label:d.deal_number+' — '+d.name, sub:(STATUS_MAP[d.status]||{label:d.status}).label, id:d.id }));
        (cheqs||[]).forEach(c   => r.push({ type:'cheque',label:'شيك: '+(c.cheque_number||c.id), sub:fmt(c.amount), id:c.id }));
        setResults(r);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const handleSelect = (r) => {
    if(r.type==='party')  { navigateSub('parties', r.id); onClose(); }
    if(r.type==='deal')   { navigateSub('deals',   r.id); onClose(); }
    if(r.type==='cheque') { navigate('cheques');          onClose(); }
  };

  const typeColors = { party:'#60a5fa', deal:'#a78bfa', cheque:'#34d399' };
  const typeLabels = { party:'طرف', deal:'عملية', cheque:'شيك' };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:500,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'80px 16px 16px'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:'100%',maxWidth:560,background:'var(--bg2)',borderRadius:14,border:'1px solid var(--border)',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
          <Icon d={Icons.search}/>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="بحث في العمليات، الأطراف، الشيكات..."
            style={{flex:1,background:'none',border:'none',outline:'none',color:'var(--text)',fontFamily:'Cairo,sans-serif',fontSize:15}}/>
          {loading && <span style={{fontSize:12,color:'var(--text3)'}}>...</span>}
          <button onClick={onClose} style={{border:'none',background:'none',color:'var(--text3)',cursor:'pointer',padding:4}}>✕</button>
        </div>
        {results.length>0 && <div style={{maxHeight:360,overflowY:'auto'}}>
          {results.map((r,i) => (
            <div key={i} className="search-result-item" onClick={()=>handleSelect(r)}>
              <span className="search-result-type" style={{background:typeColors[r.type]+'22',color:typeColors[r.type]}}>
                {typeLabels[r.type]}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.label}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{r.sub}{r.roles?.length?' · '+r.roles.join(' • '):''}</div>
              </div>
              <Icon d={Icons.arrow_l} size={14}/>
            </div>
          ))}
        </div>}
        {q.length>=2 && !loading && results.length===0 && (
          <div style={{padding:'20px',textAlign:'center',color:'var(--text3)',fontSize:13}}>لا نتائج لـ "{q}"</div>
        )}
        {q.length<2 && (
          <div style={{padding:'16px',color:'var(--text3)',fontSize:12,textAlign:'center'}}>اكتب اسم أو رقم للبحث...</div>
        )}
      </div>
    </div>
  );
}
