function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(''); setLoading(true);
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { setErr('بيانات خاطئة، حاول مرة تانية'); }
    else { onLogin(data.user); }
    setLoading(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">ت</div>
          <div className="login-title">نظام التوريدات والتمويل</div>
          <div className="login-sub">سجّل دخولك للمتابعة</div>
        </div>
        {err && <div className="error-msg">{err}</div>}
        <div className="form-group">
          <label className="form-label">البريد الإلكتروني</label>
          <input className="form-input" type="email" value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="example@email.com"/>
        </div>
        <div className="form-group">
          <label className="form-label">كلمة المرور</label>
          <input className="form-input" type="password" value={pass}
            onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="••••••••"/>
        </div>
        <button className="topbar-btn btn-primary btn-full" onClick={submit} disabled={loading}>
          {loading ? 'جاري الدخول...' : 'دخول'}
        </button>
      </div>
    </div>
  );
}
