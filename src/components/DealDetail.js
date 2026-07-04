function DealDetail({ dealId, onBack }) {
  const [deal, setDeal] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [entities, setEntities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [dealInvestors, setDealInvestors] = useState([]);
  const [collections, setCollections] = useState([]);
  const [supplyOrders, setSupplyOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [dealBrokers, setDealBrokers] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [saving, setSaving] = useState(false);

  // Modals
  const [invModal, setInvModal]       = useState(false);
  const [colModal, setColModal]       = useState(false);
  const [expModal, setExpModal]       = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [distModal, setDistModal]     = useState(false);
  const [lockModal, setLockModal]     = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [editModal, setEditModal]     = useState(false);
  const [partyTransferModal, setPartyTransferModal] = useState(false);

  // ── Supply Orders ──
  const [soModal, setSoModal]     = useState(false);
  const [soForm, setSoForm]       = useState({ order_number:'', order_date:'', expected_amount:'', notes:'' });
  const [soSaving, setSoSaving]   = useState(false);
  const SO_STATUS = { pending:'معلق', confirmed:'مؤكد', invoiced:'مُفاتَر', paid:'مدفوع', cancelled:'ملغى' };
  const SO_STATUS_CLS = { pending:'badge-amber', confirmed:'badge-blue', invoiced:'badge-purple', paid:'badge-green', cancelled:'badge-gray' };

  // ── Profit Periods (العمليات المتكررة) ──
  const [profitPeriods, setProfitPeriods] = useState([]);
  const [ppModal, setPpModal]   = useState(false);
  const [ppForm, setPpForm]     = useState({ start_date:'', end_date:'', profit_amount:'', notes:'' });
  const [ppSaving, setPpSaving] = useState(false);
  const PP_STATUS = { pending:'معلقة', distributed:'موزَّعة', cancelled:'ملغاة' };
  const PP_STATUS_CLS = { pending:'badge-amber', distributed:'badge-green', cancelled:'badge-gray' };

  const savePP = async () => {
    if (ppSaving) return;
    setPpSaving(true);
    try {
      if (deal?.is_locked) throw new Error('العملية مقفولة');
      const amt = assertPositiveAmount(ppForm.profit_amount, 'قيمة الربح');
      await callRpc('create_profit_period_atomic', {
        p_deal_id:       dealId,
        p_period_number: null, // تلقائي
        p_start_date:    ppForm.start_date || todayStr(),
        p_end_date:      ppForm.end_date   || null,
        p_profit_amount: amt,
        p_notes:         ppForm.notes      || null,
      });
      setPpModal(false);
      setPpForm({ start_date:'', end_date:'', profit_amount:'', notes:'' });
      await load();
    } catch(err) { showError(err, 'إضافة دورة ربح'); }
    finally { setPpSaving(false); }
  };

  const saveSO = async () => {
    if (soSaving) return;
    setSoSaving(true);
    try {
      if (deal?.is_locked) throw new Error('العملية مقفولة');
      await callRpc('create_supply_order_atomic', {
        p_deal_id:         dealId,
        p_order_number:    soForm.order_number || null,
        p_order_date:      soForm.order_date   || todayStr(),
        p_expected_amount: Number(soForm.expected_amount) || 0,
        p_notes:           soForm.notes        || null,
        p_idempotency_key: makeStableKey('so', dealId, makeNonce()),
      });
      setSoModal(false);
      setSoForm({ order_number:'', order_date:'', expected_amount:'', notes:'' });
      await load();
    } catch(err) { showError(err, 'إضافة أمر توريد'); }
    finally { setSoSaving(false); }
  };

  const updateSOStatus = async (orderId, newStatus) => {
    try {
      await callRpc('update_supply_order_atomic', {
        p_order_id: orderId, p_status: newStatus,
        p_order_number:null, p_order_date:null,
        p_expected_amount:null, p_actual_amount:null, p_notes:null,
      });
      await load();
    } catch(err) { showError(err, 'تحديث الحالة'); }
  };

  const [invForm, setInvForm]   = useState({ investor_id:'', amount:'', return_type:'profit_percentage', return_value:'', _nonce: makeNonce() });
  const [colForm, setColForm]   = useState({ amount:'', collection_date: new Date().toISOString().slice(0,10), payment_method:'cash', account_id:'', notes:'', _nonce: makeNonce() });
  const [expForm, setExpForm]   = useState({ category:'نقل وشحن', amount:'', expense_date: new Date().toISOString().slice(0,10), account_id:'', description:'', _nonce: makeNonce() });
  const [newStatus, setNewStatus] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  // ── تحويل لطرف عام (شركة مشتريات، لوجستيات، إلخ) ──
  // يستخدم payee_type='party' في record_payment_atomic — أي party
  // في النظام يمكنه استقبال تحويل بدون الحاجة لجدول suppliers مستقل
  const [partyTransferForm, setPartyTransferForm] = useState({
    party_id:'', party_name:'', amount:'', account_id:'', notes:'', _nonce: makeNonce(),
  });
  const [partySearchQ, setPartySearchQ] = useState('');
  const [partySearchResults, setPartySearchResults] = useState([]);

  useEffect(() => {
    if (!partySearchQ || partySearchQ.trim().length < 2) { setPartySearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.rpc('search_parties', { search_term: partySearchQ.trim() });
      setPartySearchResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [partySearchQ]);

  const savePartyTransfer = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!partyTransferForm.party_id) throw new Error('اختر الطرف المستلم أولاً');
      const amt = assertPositiveAmount(partyTransferForm.amount, 'مبلغ التحويل');
      if (deal?.is_locked) throw new Error('العملية مقفولة — لا يمكن إضافة تحويلات');
      if (!partyTransferForm.account_id) throw new Error('اختر الحساب المحوَّل منه');
      await callRpc('record_payment_atomic', {
        p_payee_type:      'party',
        p_payee_id:         partyTransferForm.party_id,
        p_payment_type:     'transfer_to_party',
        p_amount:           amt,
        p_payment_date:     todayStr(),
        p_account_id:       partyTransferForm.account_id,
        p_deal_id:          dealId,
        p_notes:            partyTransferForm.notes || null,
        p_idempotency_key:  makeStableKey('party_transfer', dealId, partyTransferForm._nonce),
      });
      await addTimeline('party_transfer', `تحويل إلى: ${partyTransferForm.party_name}`, partyTransferForm.notes, amt);
      setPartyTransferModal(false);
      setPartyTransferForm({ party_id:'', party_name:'', amount:'', account_id:'', notes:'', _nonce: makeNonce() });
      setPartySearchQ(''); setPartySearchResults([]);
      await load();
    } catch(err) { showError(err, 'تحويل لطرف'); }
    finally { setSaving(false); }
  };

  // توزيع الأرباح — قابل للتوسع بأي عدد من المستفيدين
  const emptyBene = { beneficiary_type:'investor', beneficiary_id:'', beneficiary_name_snapshot:'', amount_type:'manual', percentage:'', amount:'' };
  const [distRows,    setDistRows]    = useState([{ ...emptyBene }]);
  // round_id: generated once per distribution modal open.
  // All beneficiaries in the same round share it → retry-safe, round-unique.
  const [distRoundId, setDistRoundId] = useState(() => makeNonce());

  // تعديل العملية
  const [editForm, setEditForm] = useState({});

  const [loadError,    setLoadError]    = useState(null);
  // dataWarnings: list of query labels that failed (collections, expenses, profit_distributions).
  // Non-empty → show warning banner and block sensitive financial actions.
  const [dataWarnings, setDataWarnings] = useState([]);

  const load = useCallback(async () => {
    setLoadError(null);
    setDataWarnings([]);
    try {
      // جلب البيانات الأساسية أولاً — لو فشلت نعرف السبب
      const { data: d, error: dealErr } = await sb.from('deals')
        .select('*, entities(name), clients(name)').eq('id', dealId).single();
      if (dealErr) throw new Error('خطأ في جلب العملية: ' + dealErr.message);
      if (!d) throw new Error('العملية غير موجودة');

      // P2A-03: safeQuery (shared top-level helper) returns { data, hasError, label }
      // instead of throwing on failure. Financial calculations MUST check hasError
      // before using data. If any critical query fails we surface a banner and
      // block sensitive actions.
      const [rDi, rCol, rSO, rExp, rInv, rDb, rDist, rTl, rEnt, rAcc, rPP] = await Promise.all([
        safeQuery(sb.from('deal_investors').select('*, investors(name)').eq('deal_id', dealId), 'deal_investors'),
        safeQuery(sb.from('collections').select('*').eq('deal_id', dealId).order('collection_date'), 'collections'),
        safeQuery(sb.from('v_supply_orders_with_cheques').select('*').eq('deal_id', dealId).order('order_date',{ascending:false}), 'supply_orders'),
        safeQuery(sb.from('expenses').select('*').eq('deal_id', dealId).order('expense_date'), 'expenses'),
        safeQuery(fetchInvestorParties(), 'investors'),
        safeQuery(sb.from('deal_brokers').select('*, brokers(name)').eq('deal_id', dealId), 'deal_brokers'),
        safeQuery(sb.from('profit_distributions').select('*').eq('deal_id', dealId).order('created_at'), 'profit_distributions'),
        safeQuery(sb.from('deal_timeline').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }), 'deal_timeline'),
        safeQuery(fetchPartiesByRole('entity'), 'entities'),
        safeQuery(sb.from('accounts').select('id,name,balance'), 'accounts'),
        safeQuery(sb.from('deal_profit_periods').select('*').eq('deal_id', dealId).order('period_number'), 'profit_periods'),
      ]);

      // Identify which critical queries failed — these affect financial calculations
      const criticalErrors = [rCol, rExp, rDist].filter(r => r.hasError).map(r => r.label);
      const nonCriticalErrors = [rDi, rInv, rDb, rTl, rEnt, rAcc, rSO].filter(r => r.hasError).map(r => r.label);
      const allErrors = [...criticalErrors, ...nonCriticalErrors];

      setDeal(d);
      setDealInvestors(rDi.data);
      setCollections(rCol.data);
      setSupplyOrders(rSO.data);
      setProfitPeriods(rPP?.data || []);
      setExpenses(rExp.data);
      setInvestors(rInv.data);
      setDealBrokers(rDb.data);
      setDistributions(rDist.data);
      setTimeline(rTl.data);
      setEntities(rEnt.data);
      setAccounts(rAcc.data);
      // Store which critical queries failed so the UI can warn the user
      setDataWarnings(criticalErrors);
      setNewStatus(d.status || 'studying');
      setEditForm({
        name: d.name || '',
        value: d.value || 0,
        actual_cost: d.actual_cost || 0,
        taxable_cost: d.taxable_cost || 0,
        supply_price: d.supply_price || 0,
        tax_applicable: d.tax_applicable || false,
        tax_expected: d.tax_expected || 0,
        vat_amount: d.vat_amount || 0,
        withholding_amount: d.withholding_amount || 0,
        income_tax_amount: d.income_tax_amount || 0,
        taxable_profit: d.taxable_profit || 0,
        taxable_profit_manual: d.taxable_profit_manual || false,
        funding_required: d.funding_required || 0,
        // P2A-08: funding_provided excluded — read-only, derived from deal_investors.
        due_date: d.due_date || '',
        expected_collection_date: d.expected_collection_date || '',
        expected_end_date: d.expected_end_date || '',
        actual_end_date: d.actual_end_date || '',
        notes: d.notes || '',
      });
    } catch(err) {
      console.error('[DealDetail] ❌ CRASH in load():', err);
      console.error('[DealDetail] Stack:', err.stack);
      setLoadError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }, [dealId]);
  useEffect(() => { load(); }, [load]);

  // ── Timeline helper ──
  const addTimeline = async (event_type, event_title, event_body='', amount=null) => {
    await sb.from('deal_timeline').insert([{ deal_id: dealId, event_type, event_title, event_body, amount }]);
  };

  // ── Save functions ──
  const saveInvestor = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!invForm.investor_id) throw new Error('يجب اختيار الممول');
      const amt     = assertPositiveAmount(invForm.amount, 'مبلغ التخصيص');
      const invData = investors.find(i=>i.id===invForm.investor_id);
      if (deal?.is_locked) throw new Error('العملية مقفولة — لا يمكن إضافة ممولين');
      await callRpc('allocate_investor_to_deal_atomic', {
        p_investor_id:     invForm.investor_id,
        p_deal_id:         dealId,
        p_amount:          amt,
        p_return_type:     invForm.return_type  || 'profit_percentage',
        p_return_value:    Number(invForm.return_value) || 0,
        p_notes:           `تخصيص لعملية ${deal.deal_number}`,
        p_idempotency_key: makeStableKey('alloc', dealId, invForm.investor_id, invForm._nonce || makeNonce()),
      });
      await addTimeline('investor_added', `ممول جديد: ${invData?.name}`, `المبلغ: ${fmt(amt)}`, amt);
      setInvModal(false);
      setInvForm({ investor_id:'', amount:'', return_type:'profit_percentage', return_value:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err, 'تخصيص ممول'); }
    finally { setSaving(false); }
  };

  const saveCollection = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const amt = assertPositiveAmount(colForm.amount, 'مبلغ التحصيل');
      const remaining = Number(deal?.value||0) - totalCollected;
      if (amt > remaining + 0.01)
        throw new Error(`المبلغ (${amt.toLocaleString('ar-EG')}) أكبر من المتبقي (${remaining.toLocaleString('ar-EG')})`);
      if (deal?.is_locked) throw new Error('العملية مقفولة — لا يمكن إضافة تحصيلات');
      await callRpc('record_collection_atomic', {
        p_deal_id:         dealId,
        p_amount:          amt,
        p_collection_date: colForm.collection_date || todayStr(),
        p_payment_method:  colForm.payment_method  || 'cash',
        p_account_id:      colForm.account_id      || null,
        p_notes:           colForm.notes            || null,
        p_idempotency_key: makeStableKey('col', dealId, colForm._nonce),
      });
      await addTimeline('collection',
        `تحصيل — ${{cash:'كاش',cheque:'شيك',transfer:'تحويل'}[colForm.payment_method]||colForm.payment_method}`,
        colForm.notes, amt);
      setColModal(false);
      setColForm({ amount:'', collection_date: todayStr(), payment_method:'cash', account_id:'', notes:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err, 'تسجيل تحصيل'); }
    finally { setSaving(false); }
  };

  const saveExpense = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const amt = assertPositiveAmount(expForm.amount, 'مبلغ المصروف');
      if (deal?.is_locked) throw new Error('العملية مقفولة — لا يمكن إضافة مصروفات');
      // تحذير إذا رصيد الحساب أقل من المصروف (لكن لا يمنع التنفيذ — RPC يقرر)
      if (expForm.account_id) {
        const selectedAcc = accounts.find(a => a.id === expForm.account_id);
        if (selectedAcc && Number(selectedAcc.balance) < amt) {
          // window.confirm مُحجوب في بعض المتصفحات — نعرض تحذيراً في الـ UI بدله
          console.warn(`تحذير: رصيد الحساب (${fmt(selectedAcc.balance)}) أقل من المصروف (${fmt(amt)})`);
        }
      }
      await callRpc('record_deal_expense_atomic', {
        p_deal_id:         dealId,
        p_category:        expForm.category    || 'أخرى',
        p_amount:          amt,
        p_expense_date:    expForm.expense_date || todayStr(),
        p_account_id:      expForm.account_id  || null,
        p_description:     expForm.description || null,
        p_idempotency_key: makeStableKey('exp', dealId, expForm._nonce),
      });
      await addTimeline('expense', `مصروف: ${expForm.category}`, expForm.description, amt);
      setExpModal(false);
      setExpForm({ category:'نقل وشحن', amount:'', expense_date: todayStr(), account_id:'', description:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err, 'تسجيل مصروف'); }
    finally { setSaving(false); }
  };

  const saveStatus = async () => {
    if (saving) return;
    try {
      setSaving(true);
      const oldLabel = STATUS_MAP[deal.status]?.label || deal.status;
      const newLabel = STATUS_MAP[newStatus]?.label   || newStatus;

      if (newStatus === 'cancelled') {
        // P2A-04: Cancellation is now fully atomic via cancel_deal_atomic RPC.
        // The RPC locks the deal, releases ALL investor capital inside one
        // transaction, then sets status='cancelled'.  If any release fails the
        // entire operation rolls back — the deal stays at its current status.
        // No direct update to deals.status here. No separate capital-release loop.
        await callRpc('cancel_deal_atomic', {
          p_deal_id:         dealId,
          p_reason:          'إلغاء العملية',
          p_idempotency_key: makeStableKey('cancel', dealId),
        });
        await addTimeline('status_change', `تغيير الحالة: ${oldLabel} ← ملغاة`, 'إلغاء العملية');
      } else if (newStatus === 'studying') {
        await callRpc('return_to_study_atomic', {
          p_deal_id:         dealId,
          p_reason:          'إرجاع للدراسة',
          p_idempotency_key: makeStableKey('return_study', dealId),
        });
        await addTimeline('status_change', `تغيير الحالة: ${oldLabel} ← ${newLabel}`);
      } else {
        // All other status transitions — direct update (no capital impact).
        if (deal?.is_locked) throw new Error('الصفقة مقفولة — استخدم إعادة الفتح');
        const { error: upErr } = await sb.from('deals').update({ status: newStatus }).eq('id', dealId).eq('is_locked', false);
        if (upErr) throw upErr;
        await addTimeline('status_change', `تغيير الحالة: ${oldLabel} ← ${newLabel}`);
      }

      setStatusModal(false);
      await load();
    } catch(err) { showError(err, 'تغيير الحالة'); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    if (saving) return;
    if (deal?.is_locked) { showError(new Error('الصفقة مقفولة — استخدم إعادة الفتح قبل التعديل'), 'تعديل'); return; }
    setSaving(true);
    try {
      const tp = editForm.taxable_profit_manual ? Number(editForm.taxable_profit) : null;
      // tax_expected = مجموع الضرائب الثلاثة تلقائياً (للتوافق الخلفي مع أي كود يعتمد عليه)
      const vat   = Number(editForm.vat_amount)||0;
      const wh    = Number(editForm.withholding_amount)||0;
      const inc   = Number(editForm.income_tax_amount)||0;
      const totalTax = editForm.tax_applicable ? (vat+wh+inc) : 0;
      const { error: upErr } = await sb.from('deals').update({
        name: editForm.name, value: Number(editForm.value),
        actual_cost: Number(editForm.actual_cost), taxable_cost: Number(editForm.taxable_cost),
        supply_price: Number(editForm.supply_price),
        tax_applicable: editForm.tax_applicable, tax_expected: totalTax,
        vat_amount: editForm.tax_applicable ? vat : 0,
        withholding_amount: editForm.tax_applicable ? wh : 0,
        income_tax_amount: editForm.tax_applicable ? inc : 0,
        taxable_profit: tp, taxable_profit_manual: editForm.taxable_profit_manual,
        funding_required: Number(editForm.funding_required),
        due_date: editForm.due_date||null, expected_collection_date: editForm.expected_collection_date||null,
        expected_end_date: editForm.expected_end_date||null, actual_end_date: editForm.actual_end_date||null,
        notes: editForm.notes,
      }).eq('id', dealId).eq('is_locked', false);
      if (upErr) throw upErr;
      await addTimeline('note', 'تم تعديل بيانات العملية');
      setEditModal(false);
      await load();
    } catch(err) { showError(err, 'تعديل بيانات الصفقة'); }
    finally { setSaving(false); }
  };

  // توزيع الأرباح
  const addDistRow = () => setDistRows(r=>[...r, { ...emptyBene }]);
  const removeDistRow = (i) => setDistRows(r=>r.filter((_,idx)=>idx!==i));
  const updateDistRow = (i, field, val) => setDistRows(r=>r.map((row,idx)=>idx===i?{...row,[field]:val}:row));

  // دمج تلقائي للصفوف التي تشترك في نفس party_id (نفس الطرف بأكثر من دور)
  const mergeDuplicatePartyRows = () => {
    const warnings = partyIdentityWarnings();
    if (!warnings.length) return;
    setDistRows(prev => {
      let rows = [...prev];
      warnings.forEach(w => {
        const indices = w.rows.map(r=>r.index).sort((a,b)=>a-b);
        const keepIdx = indices[0];
        const mergeIdxs = indices.slice(1);
        const mergedAmount = indices.reduce((sum, idx) => sum + (Number(rows[idx]?.amount)||0), 0);
        const mergedRoles  = w.rows.map(r=>beneTypes[r.type]||r.type).join(' + ');
        rows[keepIdx] = {
          ...rows[keepIdx],
          amount: String(mergedAmount),
          beneficiary_name_snapshot: `${w.rows[0].name} (${mergedRoles})`,
        };
      });
      // حذف الصفوف المدموجة (بترتيب عكسي حتى لا تتغير الفهارس)
      const toRemove = new Set(warnings.flatMap(w => w.rows.map(r=>r.index)).filter((idx,_,arr)=>{
        // احتفظ فقط بأول index لكل مجموعة، احذف الباقي
        const group = warnings.find(w=>w.rows.some(r=>r.index===idx));
        return group && group.rows[0].index !== idx;
      }));
      return rows.filter((_, idx) => !toRemove.has(idx));
    });
  };

  const calcDistAmount = (row) => {
    if (row.amount_type==='manual') return Number(row.amount)||0;
    if (row.amount_type==='percentage') return Math.round(netProfit * (Number(row.percentage)||0) / 100);
    return Number(row.amount)||0;
  };

  const saveDistributions = async () => {
    if (saving) return;
    const valid = distRows.filter(r=>r.beneficiary_name_snapshot.trim() && (r.amount||r.percentage));
    if (!valid.length) return;

    try {
    if (deal?.is_locked) throw new Error('العملية مقفولة — لا يمكن توزيع الأرباح');
    if (netProfit <= 0) throw new Error('لا يمكن توزيع أرباح — صافي الربح صفر أو سالب');

    // ── Business Rule: Party Identity ──
    // منع تسجيل مستحقين منفصلين لنفس الـ party (مثل كيان=ممول) قبل الدمج
    const dupWarnings = partyIdentityWarnings();
    if (dupWarnings.length > 0) {
      const names = dupWarnings.map(w => w.rows.map(r=>r.name).join(' / ')).join('، ');
      throw new Error(`الطرف "${names}" مكرر بأكثر من دور في هذا التوزيع — ادمج صفوفه في مستحق واحد قبل المتابعة (راجع التحذير أعلى القائمة)`);
    }

    const rows = valid.map(r=>({
      deal_id: dealId,
      beneficiary_type: r.beneficiary_type,
      beneficiary_id: r.beneficiary_id||null,
      beneficiary_name_snapshot: r.beneficiary_name_snapshot,
      amount_type: r.amount_type,
      percentage: r.amount_type==='percentage' ? Number(r.percentage) : null,
      amount: calcDistAmount(r),
    }));

    const total       = rows.reduce((a,r)=>a+Number(r.amount),0);
    const alreadyDist = distributions.reduce((a,d)=>a+Number(d.amount),0);
    const totalAfter  = alreadyDist + total;

    if (total <= 0) throw new Error('يجب أن يكون إجمالي التوزيع أكبر من صفر');
    if (totalAfter > netProfit * 1.01)
      throw new Error(`إجمالي التوزيع (${totalAfter.toLocaleString('ar-EG')} ج.م) أكبر من صافي الربح (${netProfit.toLocaleString('ar-EG')} ج.م)`);

    setSaving(true);
    // P2A-05: Replaced individual RPC loop with a single batch RPC call.
    // batch_profit_distribution_atomic processes ALL beneficiaries inside one
    // PostgreSQL transaction — if any row fails, the entire round is rolled back.
    // distRoundId (generated when the modal opens) is passed as p_round_id so
    // the idempotency keys remain stable across retries of the same round.
    const beneficiariesPayload = rows.map(r => ({
      beneficiary_type: r.beneficiary_type,
      beneficiary_id:   r.beneficiary_id || null,
      beneficiary_name: r.beneficiary_name_snapshot,
      amount:           Number(r.amount),
      idempotency_key:  makeStableKey('accrual', dealId, distRoundId, r.beneficiary_id || r.beneficiary_name_snapshot),
    }));

    await callRpc('batch_profit_distribution_atomic', {
      p_deal_id:       dealId,
      p_round_id:      distRoundId,
      p_beneficiaries: beneficiariesPayload,
      p_total_amount:  total,
    });

    // Timeline only (audit is written inside the RPC for the full batch)
    await addTimeline('profit_distributed', `توزيع أرباح: ${fmt(total)}`, `${rows.length} مستفيد`, total);
    setDistModal(false); setDistRows([{ ...emptyBene }]); setDistRoundId(makeNonce());
    await load();
    } catch(err) { showError(err); }
    setSaving(false);
  };

  const lockDeal = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (remaining > 0.01)
        throw new Error(`لا يمكن القفل — يوجد مبلغ غير محصّل: ${fmt(remaining)}`);
      await callRpc('lock_deal_atomic', {
        p_deal_id:           dealId,
        p_total_distributed: totalDistributed,
        p_idempotency_key:   makeStableKey('lock', dealId),
      });
      await addTimeline('locked', 'تم قفل العملية نهائياً');
      setLockModal(false); await load();
    } catch(err) { showError(err, 'قفل العملية'); }
    finally { setSaving(false); }
  };

  const reopenDeal = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!reopenReason.trim() || reopenReason.trim().length < 5)
        throw new Error('يجب إدخال سبب واضح لإعادة الفتح (5 أحرف على الأقل)');
      await callRpc('reopen_deal_atomic', {
        p_deal_id:         dealId,
        p_reopen_reason:   reopenReason.trim(),
        p_idempotency_key: makeStableKey('reopen', dealId),
      });
      await addTimeline('reopened', 'تم فتح العملية مجدداً', reopenReason);
      setReopenModal(false); setReopenReason(''); await load();
    } catch(err) { showError(err, 'إعادة الفتح'); }
    finally { setSaving(false); }
  };

  const retTypes = { profit_percentage:'نسبة من الربح', capital_percentage:'نسبة من رأس المال', fixed_amount:'مبلغ ثابت', custom:'اتفاق خاص' };
  const payMethods = { cash:'كاش', cheque:'شيك', transfer:'تحويل' };
  const beneTypes = { investor:'ممول', entity:'كيان', owner:'المالك (عمرو)', broker:'وسيط', other:'أخرى' };

  // ── Business Rule: Party Identity ──
  // يكتشف إذا كان أي مستفيدَين في صفوف التوزيع يشتركان في نفس party_id
  // (نفس الشخص/الشركة بأكثر من دور: مثل كيان+ممول) ويُحذِّر المستخدم
  // بدل احتساب ربحين منفصلين لنفس الطرف. يعتمد على party_id الموجود
  // في investors/entities/brokers (عبر fetchPartiesByRole/fetchInvestorParties).
  const getPartyIdForBene = (row) => {
    if (!row.beneficiary_id) return null;
    if (row.beneficiary_type==='investor') return investors.find(x=>(x.role_record_id||x.id)===row.beneficiary_id)?.id || null;
    if (row.beneficiary_type==='entity')   return entities.find(x=>(x.role_record_id||x.id)===row.beneficiary_id)?.id || null;
    return null;
  };

  const partyIdentityWarnings = () => {
    const seen = {}; // party_id -> [{index, type}]
    distRows.forEach((row, i) => {
      const pid = getPartyIdForBene(row);
      if (!pid) return;
      if (!seen[pid]) seen[pid] = [];
      seen[pid].push({ index:i, type:row.beneficiary_type, name:row.beneficiary_name_snapshot });
    });
    return Object.entries(seen)
      .filter(([_, rows]) => rows.length > 1)
      .map(([partyId, rows]) => ({ partyId, rows }));
  };
  const tlIcons = { status_change:'🔄', collection:'💰', expense:'🧾', investor_added:'👤', profit_distributed:'📊', locked:'🔒', reopened:'🔓', note:'📝', attachment:'📎' };
  const attCats = { purchase_invoice:'فاتورة شراء', sales_invoice:'فاتورة بيع', bank_transfer:'تحويل بنكي', cheque:'شيك', contract:'عقد', quotation:'عرض سعر', tax_document:'مستند ضريبي', other:'أخرى' };
  const expCats = ['نقل وشحن','وقود','عمولات بنكية','عمولة وسيط','ضرائب','مشتريات','تحميل وتفريغ','مصروفات إدارية','أخرى'];

  if (loading) return <Loading text="جاري تحميل تفاصيل العملية..."/>;
  if (loadError) return (
    <div className="content">
      <button className="topbar-btn btn-ghost" onClick={onBack} style={{marginBottom:16}}>← رجوع</button>
      <div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:12,padding:24,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
        <div style={{fontWeight:700,color:'var(--red)',marginBottom:8}}>خطأ في تحميل العملية</div>
        <div style={{fontSize:12,color:'var(--text2)',marginBottom:12,direction:'ltr',fontFamily:'monospace',background:'var(--bg3)',padding:'8px 12px',borderRadius:6,textAlign:'left'}}>{loadError}</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:16}}>افتح Console (F12) للتفاصيل الكاملة</div>
        <button className="topbar-btn btn-primary" onClick={()=>{ setLoading(true); load(); }}>إعادة المحاولة</button>
      </div>
    </div>
  );
  if (!deal) return (
    <div className="content">
      <button className="topbar-btn btn-ghost" onClick={onBack} style={{marginBottom:16}}>← رجوع</button>
      <Empty icon="🔍" title="العملية غير موجودة" sub="ربما تم حذفها أو الرابط غير صحيح"/>
    </div>
  );

  // ── حسابات مالية — تتنفذ بعد التأكد من وجود deal ──
  const totalCollected   = (collections  ||[]).reduce((a,c)=>a+Number(c?.amount||0),0);
  const totalExpenses    = (expenses     ||[]).reduce((a,e)=>a+Number(e?.amount||0),0);
  const totalDistributed = (distributions||[]).reduce((a,d)=>a+Number(d?.amount||0),0);
  const remaining        = Number(deal.value||0) - totalCollected;
  const actualCost       = Number(deal.actual_cost||deal.cost||0);
  const taxCost          = Number(deal.taxable_cost||0);
  const netProfit        = totalCollected - actualCost - totalExpenses;
  const taxableProfit    = deal.taxable_profit_manual
    ? Number(deal.taxable_profit||0)
    : totalCollected - taxCost - totalExpenses;
  const undistributed    = netProfit - totalDistributed;
  const fundingGap       = Number(deal.funding_required||0) - Number(deal.funding_provided||0);

  const st = STATUS_MAP[deal.status]||{label:deal.status,cls:'badge-gray'};
  const isLocked = deal.is_locked;

  // P2A-03: block all sensitive financial actions when critical data failed to load.
  // This prevents decisions based on misleading zeros.
  const hasDataWarning = dataWarnings.length > 0;
  const dataWarningMsg = hasDataWarning
    ? `⚠️ بعض البيانات لم تُحمَّل (${dataWarnings.join('، ')}) — الأرقام قد لا تكون دقيقة. أعد المحاولة قبل تنفيذ أي عملية مالية.`
    : null;

  return (
    <div className="content">
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <button className="topbar-btn btn-ghost" onClick={onBack}>← رجوع</button>
        <div style={{flex:1,minWidth:200}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
            <span style={{fontSize:17,fontWeight:700}}>{deal.name}</span>
            <span className={`badge ${st.cls}`}>{st.label}</span>
            {isLocked && <span className="badge badge-red">🔒 مقفولة</span>}
            {deal.tax_applicable && <span className="badge badge-amber">ضريبي</span>}
          </div>
          <div style={{fontSize:12,color:'var(--text2)'}}>{deal.deal_number} · {deal.entities?.name||'—'} · {deal.clients?.name||'—'}</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {!isLocked && <button className="topbar-btn btn-ghost" onClick={()=>setEditModal(true)}>✏️ تعديل</button>}
          {!isLocked && (
            <button
              className="topbar-btn btn-ghost"
              style={{opacity: hasDataWarning ? 0.45 : 1, cursor: hasDataWarning ? 'not-allowed' : 'pointer'}}
              onClick={()=>{ if(hasDataWarning){ alert(dataWarningMsg); return; } setStatusModal(true); }}
              title={hasDataWarning ? dataWarningMsg : 'تغيير حالة العملية'}
            >تغيير الحالة</button>
          )}
          {!isLocked && distributions.length>0 && (
              <button
                className="topbar-btn btn-ghost"
                style={{color: hasDataWarning ? 'var(--text3)' : 'var(--red)', borderColor: hasDataWarning ? 'var(--text3)' : 'var(--red)', opacity: hasDataWarning ? 0.45 : 1, cursor: hasDataWarning ? 'not-allowed' : 'pointer'}}
                onClick={()=>{ if(hasDataWarning){ alert(dataWarningMsg); return; } setLockModal(true); }}
                title={hasDataWarning ? dataWarningMsg : 'قفل العملية نهائياً'}
              >🔒 قفل نهائي</button>
            )}
          {isLocked && <button className="topbar-btn btn-ghost" onClick={()=>setReopenModal(true)}>🔓 إعادة فتح</button>}
        </div>
      </div>

      {/* Funding progress */}
      {deal.funding_required > 0 && <div style={{marginBottom:16,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text2)',marginBottom:6}}>
          <span>تتبع التمويل — المطلوب: {fmt(deal.funding_required)}</span>
          <span style={{color:fundingGap>0?'var(--red)':'var(--green)'}}>الفجوة: {fmt(fundingGap)}</span>
        </div>
        <div style={{height:6,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${Math.min(100,Number(deal.funding_provided)/Number(deal.funding_required)*100)}%`,background:'var(--accent)',borderRadius:4}}/>
        </div>
        <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>تم توفيره: {fmt(deal.funding_provided)}</div>
      </div>}

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:16}}>
        <div className="stat-card">
          <div className="stat-label">سعر التوريد</div>
          <div className="stat-value">{fmtShort(deal.value)}</div>
          <div className="stat-sub">المحصّل: {fmt(totalCollected)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">المتبقي من التحصيل</div>
          <div className={`stat-value ${remaining>0?'amber':'green'}`}>{fmtShort(remaining)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">التكلفة الفعلية</div>
          <div className="stat-value red">{fmtShort(actualCost)}</div>
          {taxCost>0 && <div className="stat-sub">ضريبي: {fmt(taxCost)}</div>}
        </div>
        <StatCard label="المصروفات" valueClass="red" value={fmtShort(totalExpenses)}/>
        <div className="stat-card">
          <div className="stat-label">صافي الربح الفعلي</div>
          <div className={`stat-value ${netProfit>=0?'green':'red'}`}>{fmtShort(netProfit)}</div>
        </div>
        {deal.tax_applicable && <div className="stat-card">
          <div className="stat-label">الربح الخاضع للضريبة</div>
          <div className="stat-value amber">{fmtShort(taxableProfit)}</div>
          {deal.taxable_profit_manual && <div className="stat-sub">✏️ يدوي</div>}
        </div>}
        <div className="stat-card">
          <div className="stat-label">تم توزيعه</div>
          <div className="stat-value blue">{fmtShort(totalDistributed)}</div>
          <div className="stat-sub">غير موزع: {fmt(undistributed)}</div>
        </div>
      </div>

      {/* Collection progress */}
      {deal.value > 0 && <div style={{marginBottom:16,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text2)',marginBottom:6}}>
          <span>نسبة التحصيل</span>
          <span>{Math.min(100,Math.round(totalCollected/Number(deal.value)*100))}%</span>
        </div>
        <div style={{height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${Math.min(100,totalCollected/Number(deal.value)*100)}%`,background:'var(--green)',borderRadius:4}}/>
        </div>
      </div>}

      {/* Tabs */}
      <div className="section">
        <div className="tabs">
          {[['overview','نظرة عامة'],['supply_orders','أوامر التوريد'],['investors','الممولون'],['collections','التحصيلات'],['expenses','المصروفات'],['distributions','توزيع الأرباح'],['profit_periods','الدورات'],['timeline','السجل']].map(([k,l])=>(
            <button key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* Overview */}
        {tab==='overview' && <div style={{padding:18}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:16}}>
            {[
              ['الكيان', deal.entities?.name||'—'],
              ['العميل', deal.clients?.name||'—'],
              ['النوع', deal.deal_type==='supply'?'توريد':'تمويل'],
              ['سعر الشراء', fmt(deal.supply_price)],
              ['تاريخ الإنشاء', new Date(deal.created_at).toLocaleDateString('ar-EG')],
              ['تاريخ الاستحقاق', deal.due_date||'—'],
              ['التحصيل المتوقع', deal.expected_collection_date||'—'],
              ['الانتهاء المتوقع', deal.expected_end_date||'—'],
              ['الانتهاء الفعلي', deal.actual_end_date||'—'],
            ].map(([label,val])=>(
              <div key={label}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>{label}</div>
                <div style={{fontWeight:500}}>{val}</div>
              </div>
            ))}
          </div>
          {/* قسم الضرائب — منفصل */}
          {deal.tax_applicable && <div style={{marginTop:18,paddingTop:16,borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text3)',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>الضرائب</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
              <div className="stat-card">
                <div className="stat-label">ضريبة القيمة المضافة (VAT)</div>
                <div className="stat-value amber">{fmt(deal.vat_amount)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">خصم تحت حساب الضريبة</div>
                <div className="stat-value amber">{fmt(deal.withholding_amount)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">ضريبة الدخل</div>
                <div className="stat-value amber">{fmt(deal.income_tax_amount)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">إجمالي الضرائب</div>
                <div className="stat-value" style={{color:'var(--red)'}}>{fmt(deal.tax_expected)}</div>
              </div>
            </div>
          </div>}
          {deal.notes && <div style={{marginTop:18,paddingTop:16,borderTop:'1px solid var(--border)'}}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>ملاحظات</div>
              <div style={{color:'var(--text2)'}}>{deal.notes}</div>
          </div>}
          </div>
          {isLocked && deal.reopen_reason && <div style={{marginTop:16,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:8,padding:'10px 14px',fontSize:13}}>
            <div style={{fontWeight:600,color:'var(--red)',marginBottom:4}}>سبب إعادة الفتح</div>
            <div style={{color:'var(--text2)'}}>{deal.reopen_reason}</div>
          </div>}
        </div>}

        {/* Supply Orders */}
        {tab==='supply_orders' && <div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:'var(--text2)'}}>
              <strong>{supplyOrders.length}</strong> أمر توريد &nbsp;·&nbsp;
              إجمالي متوقع: <strong style={{color:'var(--accent)'}}>{fmt(supplyOrders.reduce((a,o)=>a+Number(o.expected_amount||0),0))}</strong>
            </span>
            {!isLocked && <button className="topbar-btn btn-primary" onClick={()=>setSoModal(true)}>
              <Icon d={Icons.plus}/> أمر توريد جديد
            </button>}
          </div>
          {supplyOrders.length===0
            ? <Empty icon="📦" title="لا توجد أوامر توريد" sub="أضف أول أمر توريد لهذه العملية"/>
            : <table className="table">
                <thead><tr>
                  <th>#</th><th>رقم الأمر</th><th>التاريخ</th>
                  <th>المتوقع</th><th>الفعلي</th><th>الحالة</th><th>ملاحظات</th>
                  {!isLocked && <th></th>}
                </tr></thead>
                <tbody>{supplyOrders.map((so,i)=>(
                  <tr key={so.id}>
                    <td style={{color:'var(--text3)',fontSize:11}}>{i+1}</td>
                    <td style={{fontWeight:600,fontFamily:'monospace'}}>{so.order_number||'—'}</td>
                    <td>{so.order_date||'—'}</td>
                    <td style={{color:'var(--accent)'}}>{fmt(so.expected_amount)}</td>
                    <td style={{color:so.actual_amount?'var(--green)':'var(--text3)'}}>
                      {so.actual_amount!=null ? fmt(so.actual_amount) : '—'}
                    </td>
                    <td><span className={`badge ${SO_STATUS_CLS[so.status]||'badge-gray'}`}>{SO_STATUS[so.status]||so.status}</span></td>
                    <td style={{color:'var(--text2)',fontSize:12}}>{so.notes||'—'}</td>
                    {!isLocked && <td>
                      <select
                        value={so.status}
                        onChange={e=>updateSOStatus(so.id,e.target.value)}
                        style={{fontSize:11,padding:'3px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg3)',color:'var(--text)',fontFamily:'Cairo,sans-serif',cursor:'pointer'}}>
                        {Object.entries(SO_STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>}
                  </tr>
                ))}</tbody>
              </table>}
        </div>}

        {/* Investors */}
        {tab==='investors' && <div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:'var(--text2)'}}>{dealInvestors.length} ممول</span>
            {!isLocked && <button className="topbar-btn btn-primary" onClick={()=>setInvModal(true)}><Icon d={Icons.plus}/> إضافة ممول</button>}
          </div>
          {dealInvestors.length===0
            ? <Empty icon="💰" title="لا يوجد ممولون"/>
            : <table className="table">
                <thead><tr><th>الممول</th><th>المبلغ</th><th>نوع العائد</th><th>العائد</th><th>مستحق</th><th>مدفوع</th></tr></thead>
                <tbody>{(dealInvestors||[]).map(di=>(
                  <tr key={di.id}>
                    <td style={{fontWeight:600}}>{di.investors?.name||'—'}</td>
                    <td style={{color:'var(--accent)'}}>{fmt(di.amount)}</td>
                    <td><span className="badge badge-gray">{retTypes[di.return_type]||di.return_type}</span></td>
                    <td>{['profit_percentage','capital_percentage'].includes(di.return_type)?di.return_value+'%':fmt(di.return_value)}</td>
                    <td style={{color:'var(--amber)'}}>{fmt(di.profit_due)}</td>
                    <td style={{color:'var(--green)'}}>{fmt(di.profit_paid)}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>}

        {/* Collections */}
        {tab==='collections' && <div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:'var(--text2)'}}>محصّل: <strong style={{color:'var(--green)'}}>{fmt(totalCollected)}</strong> — متبقي: <strong style={{color:'var(--red)'}}>{fmt(remaining)}</strong></span>
            {!isLocked && <button className="topbar-btn btn-primary" onClick={()=>setColModal(true)}><Icon d={Icons.plus}/> تسجيل تحصيل</button>}
          </div>
          {collections.length===0
            ? <Empty icon="💵" title="لا توجد تحصيلات"/>
            : <table className="table">
                <thead><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr></thead>
                <tbody>{(collections||[]).map(c=>(
                  <tr key={c.id}>
                    <td>{c.collection_date}</td>
                    <td style={{color:'var(--green)',fontWeight:600}}>{fmt(c.amount)}</td>
                    <td><span className="badge badge-blue">{payMethods[c.payment_method]||c.payment_method}</span></td>
                    <td style={{color:'var(--text2)'}}>{c.notes||'—'}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>}

        {/* Expenses */}
        {tab==='expenses' && <div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:13,color:'var(--text2)'}}>إجمالي: <strong style={{color:'var(--red)'}}>{fmt(totalExpenses)}</strong></span>
            <div style={{display:'flex',gap:8}}>
              {!isLocked && <button className="topbar-btn" style={{background:'var(--bg3)',color:'var(--text)'}} onClick={()=>setPartyTransferModal(true)}><Icon d={Icons.deposit}/> تحويل لطرف</button>}
              {!isLocked && <button className="topbar-btn btn-primary" onClick={()=>setExpModal(true)}><Icon d={Icons.plus}/> إضافة مصروف</button>}
            </div>
          </div>
          {expenses.length===0
            ? <Empty icon="🧾" title="لا توجد مصروفات"/>
            : <table className="table">
                <thead><tr><th>التاريخ</th><th>الفئة</th><th>المبلغ</th><th>البيان</th></tr></thead>
                <tbody>{(expenses||[]).map(e=>(
                  <tr key={e.id}>
                    <td>{e.expense_date}</td>
                    <td><span className="badge badge-amber">{e.category}</span></td>
                    <td style={{color:'var(--red)',fontWeight:600}}>{fmt(e.amount)}</td>
                    <td style={{color:'var(--text2)'}}>{e.description||'—'}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>}

        {/* Profit Distribution */}
        {tab==='distributions' && <div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
            <div style={{fontSize:13}}>
              <span style={{color:'var(--text2)'}}>صافي الربح: </span><strong style={{color:'var(--green)'}}>{fmt(netProfit)}</strong>
              <span style={{color:'var(--text3)',margin:'0 8px'}}>|</span>
              <span style={{color:'var(--text2)'}}>موزَّع: </span><strong style={{color:'var(--blue)'}}>{fmt(totalDistributed)}</strong>
              <span style={{color:'var(--text3)',margin:'0 8px'}}>|</span>
              <span style={{color:'var(--text2)'}}>غير موزَّع: </span><strong style={{color:undistributed<0?'var(--red)':'var(--amber)'}}>{fmt(undistributed)}</strong>
            </div>
            {!isLocked && (
              <button
                className="topbar-btn btn-primary"
                style={{opacity: hasDataWarning ? 0.45 : 1, cursor: hasDataWarning ? 'not-allowed' : 'pointer'}}
                onClick={()=>{ if(hasDataWarning){ alert(dataWarningMsg); return; } setDistModal(true); }}
                title={hasDataWarning ? dataWarningMsg : 'توزيع أرباح جديد'}
              ><Icon d={Icons.plus}/> توزيع جديد</button>
            )}
          </div>
          {distributions.length===0
            ? <Empty icon="📊" title="لم يتم توزيع الأرباح بعد"/>
            : <table className="table">
                <thead><tr><th>المستفيد</th><th>النوع</th><th>طريقة الحساب</th><th>المبلغ</th><th>الحالة</th></tr></thead>
                <tbody>{(distributions||[]).map(d=>(
                  <tr key={d.id}>
                    <td style={{fontWeight:600}}>{d.beneficiary_name_snapshot}</td>
                    <td><span className="badge badge-blue">{beneTypes[d.beneficiary_type]||d.beneficiary_type}</span></td>
                    <td><span className="badge badge-gray">{d.amount_type==='percentage'?d.percentage+'%':d.amount_type==='fixed'?'ثابت':'يدوي'}</span></td>
                    <td style={{color:'var(--green)',fontWeight:600}}>
                      {fmt(d.amount)}
                      {d.original_amount && <div style={{fontSize:10,color:'var(--text3)'}}>الأصلي: {fmt(d.original_amount)}</div>}
                    </td>
                    <td><span className={`badge ${d.is_paid?'badge-green':'badge-amber'}`}>{d.is_paid?'مدفوع':'مستحق'}</span></td>
                    {!isLocked && <td>
                      <button onClick={async()=>{
                        const newAmt = prompt(`تعديل نصيب ${d.beneficiary_name_snapshot} (الحالي: ${Number(d.amount).toLocaleString()}):`);
                        if (newAmt && !isNaN(newAmt)) {
                          await editProfitDistribution(
                            d.id, Number(newAmt), d.amount,
                            d.beneficiary_type==='investor' ? d.beneficiary_id : null,
                            d.beneficiary_type==='owner'
                          );
                          await load();
                        }
                      }} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
                        تعديل ✏️
                      </button>
                    </td>}
                  </tr>
                ))}</tbody>
              </table>}
        </div>}

        {/* Profit Periods */}
        {tab==='profit_periods' && <div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <span style={{fontSize:13,color:'var(--text2)'}}>
                <strong>{profitPeriods.length}</strong> دورة &nbsp;·&nbsp;
                موزَّع: <strong style={{color:'var(--green)'}}>{fmt(profitPeriods.filter(p=>p.status==='distributed').reduce((a,p)=>a+Number(p.profit_amount||0),0))}</strong>
                &nbsp;·&nbsp;
                معلق: <strong style={{color:'var(--amber)'}}>{fmt(profitPeriods.filter(p=>p.status==='pending').reduce((a,p)=>a+Number(p.profit_amount||0),0))}</strong>
              </span>
            </div>
            {!isLocked && <button className="topbar-btn btn-primary" onClick={()=>setPpModal(true)}>
              <Icon d={Icons.plus}/> دورة جديدة
            </button>}
          </div>
          {profitPeriods.length===0
            ? <Empty icon="🔄" title="لا توجد دورات ربح" sub="أضف دورة لتتبع الأرباح الدورية مع بقاء رأس المال مستثمراً"/>
            : <table className="table">
                <thead><tr>
                  <th>الدورة</th><th>من</th><th>إلى</th>
                  <th>الربح</th><th>الحالة</th><th>تاريخ التوزيع</th><th>ملاحظات</th>
                </tr></thead>
                <tbody>{profitPeriods.map(p=>(
                  <tr key={p.id}>
                    <td style={{fontWeight:700,color:'var(--accent)'}}>#{p.period_number}</td>
                    <td style={{fontSize:12}}>{p.start_date||'—'}</td>
                    <td style={{fontSize:12}}>{p.end_date||'مفتوحة'}</td>
                    <td style={{fontWeight:600,color:'var(--green)'}}>{fmt(p.profit_amount)}</td>
                    <td><span className={`badge ${PP_STATUS_CLS[p.status]||'badge-gray'}`}>{PP_STATUS[p.status]||p.status}</span></td>
                    <td style={{fontSize:12,color:'var(--text2)'}}>
                      {p.distributed_at ? new Date(p.distributed_at).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td style={{color:'var(--text2)',fontSize:12}}>{p.notes||'—'}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>}

        {/* Timeline */}
        {tab==='timeline' && <div style={{padding:18}}>
          {timeline.length===0
            ? <Empty icon="📅" title="لا توجد أحداث مسجلة"/>
            : <div style={{position:'relative',paddingRight:24}}>
                <div style={{position:'absolute',right:8,top:0,bottom:0,width:2,background:'var(--border)'}}/>
                {(timeline||[]).map((t,i)=>(
                  <div key={t.id} style={{marginBottom:20,position:'relative'}}>
                    <div style={{position:'absolute',right:-20,top:2,width:12,height:12,borderRadius:'50%',background:'var(--accent)',border:'2px solid var(--bg)'}}/>
                    <div style={{fontSize:12,color:'var(--text3)',marginBottom:4}}>{new Date(t.created_at).toLocaleString('ar-EG')}</div>
                    <div style={{fontWeight:600,fontSize:14}}>{tlIcons[t.event_type]||'•'} {t.event_title}</div>
                    {t.event_body && <div style={{fontSize:13,color:'var(--text2)',marginTop:3}}>{t.event_body}</div>}
                    {t.amount && <div style={{fontSize:13,color:'var(--green)',marginTop:3}}>{fmt(t.amount)}</div>}
                  </div>
                ))}
              </div>}
        </div>}
      </div>

      {/* ── Modals ── */}

      {/* تعديل العملية */}
      {editModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditModal(false)}>
        <div className="modal" style={{maxWidth:620}}>
          <div className="modal-header"><span className="modal-title">تعديل بيانات العملية</span><button className="modal-close" onClick={()=>setEditModal(false)}>✕</button></div>
          <div className="modal-body" style={{maxHeight:'70vh',overflowY:'auto'}}>
            <div className="form-group"><label className="form-label">اسم العملية</label>
              <input className="form-input" value={editForm.name||''} onChange={e=>setEditForm({...editForm,name:e.target.value})}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">سعر التوريد</label>
                <input className="form-input" type="number" value={editForm.value||''} onChange={e=>setEditForm({...editForm,value:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">التكلفة الفعلية للشراء</label>
                <input className="form-input" type="number" value={editForm.actual_cost||''} onChange={e=>setEditForm({...editForm,actual_cost:e.target.value})} placeholder="0"/>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>المبلغ الحقيقي المدفوع — يُحسب منه الربح الفعلي</div>
              </div>
              <div className="form-group">
                <label className="form-label">قيمة الفاتورة الضريبية</label>
                <input className="form-input" type="number" value={editForm.taxable_cost||''} onChange={e=>setEditForm({...editForm,taxable_cost:e.target.value})} placeholder="0"/>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>مرجع ضريبي فقط — لا يحرك البنك، يُحسب منه الربح الضريبي</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">التمويل المطلوب</label>
                <input className="form-input" type="number" value={editForm.funding_required||''} onChange={e=>setEditForm({...editForm,funding_required:e.target.value})} placeholder="0"/>
              </div>
              <div className="form-group">
                <label className="form-label">التمويل المُوفَّر</label>
                {/* P2A-08: read-only — value is maintained by allocation RPCs only */}
                <div className="form-input" style={{background:'var(--bg3)',color:'var(--text2)',cursor:'not-allowed',display:'flex',alignItems:'center'}}>
                  {fmt(deal.funding_provided||0)}
                  <span style={{fontSize:11,marginRight:'auto',color:'var(--text3)'}}>محسوب تلقائياً</span>
                </div>
              </div>
            </div>
            <div style={{background:'var(--bg3)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:14,marginBottom:10}}>
                <input type="checkbox" checked={editForm.tax_applicable||false} onChange={e=>setEditForm({...editForm,tax_applicable:e.target.checked})} style={{width:16,height:16}}/>
                العملية خاضعة للضريبة
              </label>
              {editForm.tax_applicable && <>
                {/* Version 1 — ضرائب منفصلة (VAT / Withholding / Income Tax) */}
                {/* مُصمَّمة كأعمدة في deals الآن — يسهل نقلها لجدول deal_taxes مستقبلاً */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:8}}>
                  <div className="form-group">
                    <label className="form-label">ضريبة القيمة المضافة (VAT)</label>
                    <input className="form-input" type="number" value={editForm.vat_amount||''} onChange={e=>setEditForm({...editForm,vat_amount:e.target.value})} placeholder="0"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">خصم تحت حساب الضريبة</label>
                    <input className="form-input" type="number" value={editForm.withholding_amount||''} onChange={e=>setEditForm({...editForm,withholding_amount:e.target.value})} placeholder="0"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ضريبة الدخل</label>
                    <input className="form-input" type="number" value={editForm.income_tax_amount||''} onChange={e=>setEditForm({...editForm,income_tax_amount:e.target.value})} placeholder="0"/>
                  </div>
                </div>
                <div style={{fontSize:11,color:'var(--text2)',marginBottom:8,paddingTop:6,borderTop:'1px solid var(--border)'}}>
                  إجمالي الضرائب المتوقعة: <strong>{fmt((Number(editForm.vat_amount)||0)+(Number(editForm.withholding_amount)||0)+(Number(editForm.income_tax_amount)||0))}</strong>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13,marginTop:8}}>
                  <input type="checkbox" checked={editForm.taxable_profit_manual||false} onChange={e=>setEditForm({...editForm,taxable_profit_manual:e.target.checked})} style={{width:14,height:14}}/>
                  تحديد الربح الخاضع للضريبة يدوياً
                </label>
                {editForm.taxable_profit_manual && <div className="form-group" style={{marginTop:8}}><label className="form-label">الربح الخاضع للضريبة (ج.م)</label>
                  <input className="form-input" type="number" value={editForm.taxable_profit||''} onChange={e=>setEditForm({...editForm,taxable_profit:e.target.value})}/>
                </div>}
              </>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">تاريخ الاستحقاق</label>
                <input className="form-input" type="date" value={editForm.due_date||''} onChange={e=>setEditForm({...editForm,due_date:e.target.value})}/>
              </div>
              <div className="form-group"><label className="form-label">تاريخ التحصيل المتوقع</label>
                <input className="form-input" type="date" value={editForm.expected_collection_date||''} onChange={e=>setEditForm({...editForm,expected_collection_date:e.target.value})}/>
              </div>
              <div className="form-group"><label className="form-label">الانتهاء المتوقع</label>
                <input className="form-input" type="date" value={editForm.expected_end_date||''} onChange={e=>setEditForm({...editForm,expected_end_date:e.target.value})}/>
              </div>
              <div className="form-group"><label className="form-label">الانتهاء الفعلي</label>
                <input className="form-input" type="date" value={editForm.actual_end_date||''} onChange={e=>setEditForm({...editForm,actual_end_date:e.target.value})}/>
              </div>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={editForm.notes||''} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setEditModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveEdit} disabled={saving}>{saving?'جاري الحفظ...':'حفظ التعديلات'}</button>
          </div>
        </div>
      </div>}

      {/* توزيع الأرباح */}
      {distModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDistModal(false)}>
        <div className="modal" style={{maxWidth:680}}>
          <div className="modal-header"><span className="modal-title">توزيع الأرباح</span><button className="modal-close" onClick={()=>setDistModal(false)}>✕</button></div>
          <div className="modal-body" style={{maxHeight:'70vh',overflowY:'auto'}}>
            <div style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>صافي الربح المتاح للتوزيع</span>
                <strong style={{color:'var(--green)'}}>{fmt(netProfit)}</strong>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4,color:'var(--text2)'}}>
                <span>المُوزَّع في هذه الجلسة</span>
                <span>{fmt(distRows.reduce((a,r)=>a+calcDistAmount(r),0))}</span>
              </div>
            </div>

            {/* ── Business Rule Banner: Party Identity ── */}
            {partyIdentityWarnings().length > 0 && (
              <div style={{
                background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.4)',
                borderRadius:10, padding:'12px 14px', marginBottom:12,
                display:'flex', alignItems:'flex-start', gap:10,
              }}>
                <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--amber)',marginBottom:4}}>
                    تنبيه: نفس الطرف مكرر بأكثر من دور
                  </div>
                  <div style={{fontSize:12,color:'var(--text2)',marginBottom:8}}>
                    {partyIdentityWarnings().map(w=>w.rows.map(r=>`${r.name} (${beneTypes[r.type]||r.type})`).join(' + ')).join('، ')}
                    {' '}— هذا يمثل مستحقاً واحداً وليس مستحقَين منفصلَين. ادمجهما لتجنب احتساب ربح مضاعف.
                  </div>
                  <button
                    onClick={mergeDuplicatePartyRows}
                    className="topbar-btn"
                    style={{background:'var(--amber)',color:'#1a1a1a',fontSize:12,padding:'5px 14px'}}>
                    دمج تلقائي للصفوف المكررة
                  </button>
                </div>
              </div>
            )}

            {(distRows||[]).map((row,i)=>(
              <div key={i} style={{background:'var(--bg3)',borderRadius:8,padding:'12px 14px',marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:600,color:'var(--text2)'}}>مستفيد {i+1}</span>
                  {distRows.length>1 && <button onClick={()=>removeDistRow(i)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:18}}>✕</button>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div className="form-group"><label className="form-label">نوع المستفيد</label>
                    <select className="form-select" value={row.beneficiary_type} onChange={e=>{
                      updateDistRow(i,'beneficiary_type',e.target.value);
                      updateDistRow(i,'beneficiary_id','');
                      updateDistRow(i,'beneficiary_name_snapshot','');
                    }}>
                      {Object.entries(beneTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">
                    {row.beneficiary_type==='investor'?'اختر الممول':row.beneficiary_type==='entity'?'اختر الكيان':'الاسم'}
                  </label>
                    {row.beneficiary_type==='investor'
                      ? <select className="form-select" value={row.beneficiary_id} onChange={e=>{
                          const inv=investors.find(x=>(x.role_record_id||x.id)===e.target.value);
                          updateDistRow(i,'beneficiary_id',e.target.value);
                          updateDistRow(i,'beneficiary_name_snapshot',inv?.name||'');
                        }}>
                          <option value="">اختر الممول</option>
                          {(investors||[]).map(inv=><option key={inv.role_record_id||inv.id} value={inv.role_record_id||inv.id}>{inv.name}</option>)}
                        </select>
                      : row.beneficiary_type==='entity'
                      ? <select className="form-select" value={row.beneficiary_id} onChange={e=>{
                          const ent=entities.find(x=>(x.role_record_id||x.id)===e.target.value);
                          updateDistRow(i,'beneficiary_id',e.target.value);
                          updateDistRow(i,'beneficiary_name_snapshot',ent?.name||'');
                        }}>
                          <option value="">اختر الكيان</option>
                          {(entities||[]).map(ent=><option key={ent.role_record_id||ent.id} value={ent.role_record_id||ent.id}>{ent.name}</option>)}
                        </select>
                      : <input className="form-input" value={row.beneficiary_name_snapshot} onChange={e=>updateDistRow(i,'beneficiary_name_snapshot',e.target.value)} placeholder="الاسم"/>
                    }
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <div className="form-group"><label className="form-label">طريقة الحساب</label>
                    <select className="form-select" value={row.amount_type} onChange={e=>updateDistRow(i,'amount_type',e.target.value)}>
                      <option value="manual">مبلغ يدوي</option>
                      <option value="percentage">نسبة من الربح</option>
                      <option value="fixed">مبلغ ثابت</option>
                    </select>
                  </div>
                  {row.amount_type==='percentage'
                    ? <div className="form-group"><label className="form-label">النسبة %</label>
                        <input className="form-input" type="number" value={row.percentage} onChange={e=>updateDistRow(i,'percentage',e.target.value)} placeholder="0"/>
                      </div>
                    : <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
                        <input className="form-input" type="number" value={row.amount} onChange={e=>updateDistRow(i,'amount',e.target.value)} placeholder="0"/>
                      </div>
                  }
                  <div className="form-group"><label className="form-label">المحسوب</label>
                    <div style={{padding:'10px 12px',background:'var(--bg2)',borderRadius:8,fontSize:14,fontWeight:600,color:'var(--green)'}}>{fmt(calcDistAmount(row))}</div>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addDistRow} className="topbar-btn btn-ghost" style={{width:'100%',justifyContent:'center'}}>+ إضافة مستفيد آخر</button>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setDistModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveDistributions} disabled={saving}>{saving?'جاري الحفظ...':'تأكيد التوزيع'}</button>
          </div>
        </div>
      </div>}

      {/* ممول */}
      {invModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setInvModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إضافة ممول للعملية</span><button className="modal-close" onClick={()=>setInvModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">الممول</label>
              <select className="form-select" value={invForm.investor_id} onChange={e=>setInvForm({...invForm,investor_id:e.target.value})}>
                <option value="">اختر الممول</option>
                {(investors||[]).map(i=><option key={i.role_record_id||i.id} value={i.role_record_id||i.id}>{i.name}{i.available_balance!==undefined?' — متاح: '+fmt(i.available_balance):''}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={invForm.amount} onChange={e=>setInvForm({...invForm,amount:e.target.value})} placeholder="0"/>
            </div>
            <div className="form-group"><label className="form-label">نوع العائد</label>
              <select className="form-select" value={invForm.return_type} onChange={e=>setInvForm({...invForm,return_type:e.target.value})}>
                {Object.entries(retTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">{invForm.return_type==='fixed_amount'?'المبلغ (ج.م)':'النسبة %'}</label>
              <input className="form-input" type="number" value={invForm.return_value} onChange={e=>setInvForm({...invForm,return_value:e.target.value})} placeholder="0"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setInvModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveInvestor} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}

      {/* تحصيل */}
      {colModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setColModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">تسجيل تحصيل</span><button className="modal-close" onClick={()=>setColModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={colForm.amount} onChange={e=>setColForm({...colForm,amount:e.target.value})} placeholder="0"/>
            </div>
            {colForm.amount && <div style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--green)',marginBottom:12}}>
              بعد التحصيل: {fmt(totalCollected+Number(colForm.amount))} — متبقي: {fmt(Math.max(0,remaining-Number(colForm.amount)))}
            </div>}
            <div className="form-group"><label className="form-label">التاريخ</label>
              <input className="form-input" type="date" value={colForm.collection_date} onChange={e=>setColForm({...colForm,collection_date:e.target.value})}/>
            </div>
            <div className="form-group"><label className="form-label">طريقة الدفع</label>
              <select className="form-select" value={colForm.payment_method} onChange={e=>setColForm({...colForm,payment_method:e.target.value})}>
                <option value="cash">كاش</option><option value="cheque">شيك</option><option value="transfer">تحويل بنكي</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">الحساب المستلم</label>
              <select className="form-select" value={colForm.account_id} onChange={e=>setColForm({...colForm,account_id:e.target.value})}>
                <option value="">— بدون تحديد حساب —</option>
                {(accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={colForm.notes} onChange={e=>setColForm({...colForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setColModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveCollection} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}

      {/* مصروف */}
      {expModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setExpModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إضافة مصروف</span><button className="modal-close" onClick={()=>setExpModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">الفئة</label>
              <select className="form-select" value={expForm.category} onChange={e=>setExpForm({...expForm,category:e.target.value})}>
                {expCats.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={expForm.amount} onChange={e=>setExpForm({...expForm,amount:e.target.value})} placeholder="0"/>
            </div>
            <div className="form-group"><label className="form-label">التاريخ</label>
              <input className="form-input" type="date" value={expForm.expense_date} onChange={e=>setExpForm({...expForm,expense_date:e.target.value})}/>
            </div>
            <div className="form-group"><label className="form-label">الحساب</label>
              <select className="form-select" value={expForm.account_id} onChange={e=>setExpForm({...expForm,account_id:e.target.value})}>
                <option value="">— بدون تحديد حساب —</option>
                {(accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">البيان</label>
              <input className="form-input" value={expForm.description} onChange={e=>setExpForm({...expForm,description:e.target.value})} placeholder="تفاصيل المصروف"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setExpModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveExpense} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}

      {/* تحويل لطرف عام (شركة مشتريات / لوجستيات / إلخ) */}
      {ppModal && <Modal title="دورة ربح جديدة" onClose={()=>setPpModal(false)} onSave={savePP} saving={ppSaving} saveLabel="إضافة">
        <div style={{background:'rgba(61,127,255,.08)',border:'1px solid rgba(61,127,255,.2)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:12,color:'var(--text2)'}}>
          💡 رأس المال يظل مستثمراً داخل العملية — هذه الدورة تُوزَّع فيها الأرباح فقط
        </div>
        <Field label="تاريخ بداية الدورة" required>
          <Input type="date" value={ppForm.start_date||todayStr()} onChange={e=>setPpForm({...ppForm,start_date:e.target.value})}/>
        </Field>
        <Field label="تاريخ نهاية الدورة">
          <Input type="date" value={ppForm.end_date} onChange={e=>setPpForm({...ppForm,end_date:e.target.value})} placeholder="اختياري — اتركه فارغاً للدورات المفتوحة"/>
        </Field>
        <Field label="قيمة الربح (ج.م)" required>
          <Input type="number" value={ppForm.profit_amount} onChange={e=>setPpForm({...ppForm,profit_amount:e.target.value})} placeholder="0"/>
        </Field>
        <Field label="ملاحظات">
          <Input value={ppForm.notes} onChange={e=>setPpForm({...ppForm,notes:e.target.value})} placeholder="اختياري"/>
        </Field>
      </Modal>}

      {soModal && <Modal title="أمر توريد جديد" onClose={()=>setSoModal(false)} onSave={saveSO} saving={soSaving} saveLabel="إضافة">
        <Field label="رقم الأمر">
          <Input value={soForm.order_number} onChange={e=>setSoForm({...soForm,order_number:e.target.value})} placeholder="مثال: PO-2025-001 (اختياري)"/>
        </Field>
        <Field label="تاريخ الأمر">
          <Input type="date" value={soForm.order_date||todayStr()} onChange={e=>setSoForm({...soForm,order_date:e.target.value})}/>
        </Field>
        <Field label="القيمة المتوقعة (ج.م)">
          <Input type="number" value={soForm.expected_amount} onChange={e=>setSoForm({...soForm,expected_amount:e.target.value})} placeholder="0"/>
        </Field>
        <Field label="ملاحظات">
          <Input value={soForm.notes} onChange={e=>setSoForm({...soForm,notes:e.target.value})} placeholder="اختياري"/>
        </Field>
      </Modal>}

      {partyTransferModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setPartyTransferModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">تحويل أموال لطرف</span><button className="modal-close" onClick={()=>setPartyTransferModal(false)}>✕</button></div>
          <div className="modal-body">
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
              استخدم هذا لتحويل أموال لشركة مشتريات أو لوجستيات أو أي طرف لا يملك حساباً تشغيلياً في النظام — لا يؤثر على أرصدة الممولين أو الوسطاء.
            </div>
            <div className="form-group">
              <label className="form-label">البحث عن الطرف</label>
              {partyTransferForm.party_id
                ? <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'var(--bg3)',borderRadius:8}}>
                    <span style={{fontWeight:600,fontSize:13}}>{partyTransferForm.party_name}</span>
                    <button onClick={()=>setPartyTransferForm({...partyTransferForm,party_id:'',party_name:''})}
                      style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:13}}>تغيير</button>
                  </div>
                : <>
                  <input className="form-input" value={partySearchQ} onChange={e=>setPartySearchQ(e.target.value)} placeholder="ابحث بالاسم..."/>
                  {partySearchResults.length>0 && <div style={{marginTop:6,border:'1px solid var(--border)',borderRadius:8,maxHeight:160,overflowY:'auto'}}>
                    {partySearchResults.map(p=>(
                      <div key={p.id} onClick={()=>{ setPartyTransferForm({...partyTransferForm,party_id:p.id,party_name:p.name}); setPartySearchQ(''); setPartySearchResults([]); }}
                        style={{padding:'8px 12px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border)'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        {p.name} {p.roles?.length?<span style={{color:'var(--text3)',fontSize:11}}> ({p.roles.join(', ')})</span>:''}
                      </div>
                    ))}
                  </div>}
                </>}
            </div>
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={partyTransferForm.amount} onChange={e=>setPartyTransferForm({...partyTransferForm,amount:e.target.value})} placeholder="0"/>
            </div>
            <div className="form-group"><label className="form-label">الحساب المحوَّل منه</label>
              <select className="form-select" value={partyTransferForm.account_id} onChange={e=>setPartyTransferForm({...partyTransferForm,account_id:e.target.value})}>
                <option value="">اختر الحساب</option>
                {(accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={partyTransferForm.notes} onChange={e=>setPartyTransferForm({...partyTransferForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setPartyTransferModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={savePartyTransfer} disabled={saving}>{saving?'جاري الحفظ...':'تأكيد التحويل'}</button>
          </div>
        </div>
      </div>}

      {/* تغيير الحالة */}
      {statusModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setStatusModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">تغيير الحالة</span><button className="modal-close" onClick={()=>setStatusModal(false)}>✕</button></div>
          <div className="modal-body">
            <select className="form-select" value={newStatus} onChange={e=>setNewStatus(e.target.value)}>
              {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setStatusModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveStatus} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}

      {/* قفل العملية */}
      {lockModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setLockModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">🔒 قفل العملية نهائياً</span><button className="modal-close" onClick={()=>setLockModal(false)}>✕</button></div>
          <div className="modal-body">
            <div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:8,padding:'12px 14px',fontSize:13,marginBottom:12}}>
              بعد القفل لن يمكن إضافة تحصيلات أو مصروفات أو توزيع أرباح جديد إلا بعد إعادة الفتح مع تسجيل السبب.
            </div>
            <div style={{fontSize:14}}>إجمالي الموزَّع: <strong style={{color:'var(--green)'}}>{fmt(totalDistributed)}</strong></div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setLockModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" style={{background:'var(--red)'}} onClick={lockDeal} disabled={saving}>{saving?'جاري القفل...':'تأكيد القفل'}</button>
          </div>
        </div>
      </div>}

      {/* إعادة فتح */}
      {reopenModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setReopenModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">🔓 إعادة فتح العملية</span><button className="modal-close" onClick={()=>setReopenModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">سبب إعادة الفتح <span style={{color:'var(--red)'}}>*</span></label>
              <input className="form-input" value={reopenReason} onChange={e=>setReopenReason(e.target.value)} placeholder="مثال: وصلت مصروفات إضافية بعد الإغلاق"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>سيُسجَّل هذا السبب في سجل العملية</div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setReopenModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={reopenDeal} disabled={saving||!reopenReason.trim()}>{saving?'جاري الفتح...':'تأكيد إعادة الفتح'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
