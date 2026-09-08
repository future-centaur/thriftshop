import {useEffect,useState,useRef,useMemo,useCallback} from 'react';
import {AnimatePresence,motion,useMotionValue,useTransform,animate,LayoutGroup} from 'framer-motion';
import {api, authApi} from './api';
import type {User} from './api';
import {LoginScreen, FirstRunWizard} from './LoginScreen';
import {
  ArrowRight, BarChart3, Banknote, Camera, Check, ChevronRight,
  Edit3, Layers3, LogOut, Menu, Package, Plus, Search, ShoppingBag,
  Smartphone, Tag, WalletCards, X,
} from 'lucide-react';
import {
  bouncySpring, smoothSpring, snappySpring, gentleSpring,
  tabDirection, pageVariants,
  backdropVariants, modalVariants, toastVariants,
  staggerContainer, staggerItem, flowCardStagger, flowCardItem,
  navItemVariants, activeIndicatorVariants, cartItemVariants,
  loadingPulse, loadingTextStagger, loadingTextItem,
  hoverLift, tapPress, floatAnimation,
} from './animations';

// ============================================================
// Types
// ============================================================
type Item = {
  id: string; baleId: string; name?: string; category: string;
  size: string; quality: string; basePrice: number;
  status: 'DRAFT' | 'AVAILABLE' | 'SOLD' | 'REMOVED';
  photo?: string; photoKey?: string; photoUrl?: string;
};
type Bale = {
  id: string; baleNumber: string; purchaseDate: string;
  purchasePrice: number; itemCount: number; supplier: string;
};
type Rule = { id: string; category: string; quality: string; basePrice: number };
type Sale = {
  id: string; createdAt: string; total: number; paymentMethod: string;
  isRefund?: boolean; reason?: string; originalSaleId?: string;
  items: { itemId: string; basePrice: number; actualSalePrice: number }[];
};
type Tab = 'home' | 'receive' | 'stock' | 'sell' | 'review' | 'expenses' | 'report' | 'settings';

const sizes = ['XS','S','M','L','XL','XXL','Free Size'];
const money = (n: number) => `KSh ${Math.round(n).toLocaleString()}`;

// ============================================================
// Expense types
// ============================================================
type Expense = { id: string; description: string; category: string; amount: number; expenseDate: string };
type ExpenseCategory = { id: string; name: string };

// ============================================================
// Auth & idle lock constants
// ============================================================
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// ============================================================
// CountUp: smoothly animates a number to its target value
// ============================================================
function CountUp({ value, format = (n) => Math.round(n).toLocaleString() }: {
  value: number; format?: (n: number) => string;
}) {
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, format);
  const [text, setText] = useState(format(0));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsubscribe = display.on('change', (v) => setText(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value, motionValue, display]);

  return <>{text}</>;
}

// ============================================================
// Main App
// ============================================================
export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [prevTab, setPrevTab] = useState<Tab>('home');
  const [items, setItems] = useState<Item[]>([]);
  const [bales, setBales] = useState<Bale[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [qualityLevels, setQualityLevels] = useState<string[]>([]);
  const [qualityRecords, setQualityRecords] = useState<{id:string;name:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<{id: string; message: string}[]>([]);
  const [menu, setMenu] = useState(false);

  // ============================================================
  // Auth state
  // ============================================================
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null); // null = checking
  const [users, setUsers] = useState<User[]>([]); // For admin user filter on Expenses tab
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]); // admin sees all; attendant filtered
  const [showBale, setShowBale] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [showRule, setShowRule] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [cart, setCart] = useState<{item: Item; price: number}[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [showExpense, setShowExpense] = useState(false);
  const [showRefund, setShowRefund] = useState<{saleId: string; total: number} | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'attendant'>('attendant');
  const [creatingUser, setCreatingUser] = useState(false);
  const [showNewPin, setShowNewPin] = useState<{name: string; pin: string} | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  // ============================================================
  // Data fetching
  // ============================================================
  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get<{
        isSetup: boolean; users: User[];
        items: Item[]; bales: Bale[]; rules: Rule[]; sales: Sale[];
        categories: string[]; qualities: string[];
        qualityRecords: {id: string; name: string}[];
        expenses: Expense[];
        expenseCategories: ExpenseCategory[];
      }>('/api/bootstrap');
      const d = r.data;

      // If no users exist, this is a first-run — skip normal auth flow
      if (!d.isSetup) {
        setIsFirstRun(true);
        setLoading(false);
        return;
      }

      // Get session to confirm auth
      const session = await authApi.getSession();
      if (!session.data.user) {
        setIsFirstRun(false);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      setCurrentUser(session.data.user);
      setIsFirstRun(false);
      setUsers(d.users || []);

      // Admin sees all expenses; attendant sees only their own
      const isAdmin = session.data.user.role === 'admin';
      const filteredExpenses = isAdmin
        ? d.expenses
        : d.expenses.filter((e: Expense & { userId?: string }) => e.userId === session.data.user?.id);

      setItems(d.items); setBales(d.bales); setRules(d.rules);
      setSales(d.sales); setCategories(d.categories);
      setQualityLevels(d.qualities || []);
      setQualityRecords(d.qualityRecords || []);
      setExpenses(filteredExpenses);
      setAllExpenses(d.expenses); // admin: all expenses for filter
      setExpenseCategories(d.expenseCategories || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  // ============================================================
  // Idle auto-lock: log out after 15 min of inactivity
  // ============================================================
  useEffect(() => {
    if (!currentUser) return;

    let timer: number | null = null;
    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        handleLogout(true);
      }, IDLE_TIMEOUT_MS);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [currentUser]);

  const handleLogout = async (idle: boolean = false) => {
    try {
      await authApi.logout();
    } catch {
      // Even if the API call fails, clear local state
    }
    setCurrentUser(null);
    setShowProfile(false);
    setIsFirstRun(false);
    setItems([]); setBales([]); setRules([]); setSales([]);
    setCategories([]); setQualityLevels([]); setQualityRecords([]);
    setExpenses([]); setExpenseCategories([]);
    setTab('home');
    if (idle) {
      showToast('Signed out due to inactivity');
    }
  };

  // ============================================================
  // Toast system
  // ============================================================
  const showToast = useCallback((message: string) => {
    const id = Date.now().toString() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2500);
  }, []);

  // ============================================================
  // Derived state
  // ============================================================
  const available = items.filter((i) => i.status === 'AVAILABLE');
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => s.createdAt.slice(0, 10) === today);
  const todayExpenses = expenses.filter((e) => e.expenseDate === today);
  const revenue = todaySales.reduce((a, s) => a + s.total, 0);
  const grossProfit = todaySales.reduce(
    (a, s) => a + s.items.reduce((x, i) => x + i.actualSalePrice - i.basePrice, 0),
    0
  );
  // Net = gross profit minus today's shop expenses (rent, transport, etc.)
  const todayExpenseTotal = todayExpenses.reduce((a, e) => a + e.amount, 0);
  const profit = grossProfit - todayExpenseTotal;

  // ============================================================
  // Tab navigation with direction tracking
  // ============================================================
  const go = (t: Tab) => {
    setPrevTab(tab);
    setTab(t);
    setMenu(false);
  };
  const direction = useMemo(() => tabDirection(prevTab, tab), [prevTab, tab]);

  // ============================================================
  // API actions
  // ============================================================
  const createBale = async (p: {
    purchaseDate: string; purchasePrice: number; itemCount: number;
    supplier: string; quick?: boolean; categoryCounts?: Record<string, number>;
  }) => {
    try {
      const r = await api.post('/api/bales', p);
      setShowBale(false);
      await refresh();
      showToast(p.quick
        ? `Bale recorded — ${r.data.itemsCreated} pieces ready to complete later`
        : 'Bale recorded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not record bale');
    }
  };

  const createItem = async (p: {
    baleId: string; name?: string; category: string; size: string;
    quality: string; basePrice?: number; photoData?: string; photoType?: string;
  }) => {
    const rule = rules.find((r) => r.category === p.category && r.quality === p.quality);
    try {
      const r = await api.post('/api/items', {
        baleId: p.baleId, name: p.name, category: p.category,
        size: p.size, quality: p.quality,
        basePrice: p.basePrice || rule?.basePrice || 0,
      });
      if (p.photoData && r.data.id) {
        await api.post(`/api/items/${r.data.id}/photo`, {
          content: p.photoData, contentType: p.photoType || 'image/webp',
        });
      }
      setShowItem(false);
      await refresh();
      showToast(p.photoData ? 'Item added with photo' : 'Item added');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add item');
    }
  };

  const saveRule = async (p: { category: string; quality: string; basePrice: number }) => {
    try {
      await api.post('/api/rules', p);
      setShowRule(false); setEditRule(null);
      await refresh();
      showToast('Base price saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save price');
    }
  };

  const saveItem = async (id: string, p: Partial<Item>) => {
    try {
      await api.put(`/api/items/${id}`, p);
      setEditItem(null);
      await refresh();
      showToast(p.status === 'DRAFT' ? 'Piece saved as draft' : 'Inventory updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update item');
    }
  };

  const uploadItemPhoto = async (id: string, content: string, contentType: string) => {
    try {
      const r = await api.post(`/api/items/${id}/photo`, { content, contentType });
      const photoUrl = String(r.data.photoUrl || '');
      const cacheBusted = photoUrl
        ? `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
        : '';
      setItems((xs) => xs.map((x) => x.id === id
        ? { ...x, photoKey: r.data.photoKey || x.photoKey, photoUrl: cacheBusted, photo: '' }
        : x));
      setEditItem((x) => x && x.id === id
        ? { ...x, photoKey: r.data.photoKey || x.photoKey, photoUrl: cacheBusted, photo: '' }
        : x);
      showToast('Photo saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not upload photo');
    }
  };

  const removeItemPhoto = async (id: string) => {
    try {
      await api.delete(`/api/items/${id}/photo`);
      setItems((xs) => xs.map((x) => x.id === id
        ? { ...x, photoKey: '', photoUrl: '', photo: '' } : x));
      setEditItem((x) => x && x.id === id
        ? { ...x, photoKey: '', photoUrl: '', photo: '' } : x);
      showToast('Photo removed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not remove photo');
    }
  };

  const createCat = async (name: string) => {
    try { await api.post('/api/categories', { name }); await refresh(); showToast('Category added'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not add category'); }
  };
  const renameCat = async (oldName: string, name: string) => {
    try { await api.put(`/api/categories/${encodeURIComponent(oldName)}`, { name }); await refresh(); showToast('Category renamed'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not rename category'); }
  };
  const createQuality = async (name: string) => {
    try { await api.post('/api/qualities', { name }); await refresh(); showToast('Quality added'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not add quality'); }
  };
  const deleteQuality = async (id: string) => {
    try { await api.delete(`/api/qualities/${id}`); await refresh(); showToast('Quality deleted'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Quality cannot be deleted because it is in use'); }
  };

  const addExpense = async (p: { description: string; category: string; amount: number; expenseDate: string }) => {
    try {
      await api.post('/api/expenses', p);
      setShowExpense(false);
      await refresh();
      showToast('Expense recorded');
    } catch {
      showToast('Could not add expense');
    }
  };

  const removeExpense = async (id: string) => {
    try {
      await api.delete(`/api/expenses/${id}`);
      await refresh();
      showToast('Expense removed');
    } catch {
      showToast('Could not remove expense');
    }
  };

  const addExpenseCategory = async (name: string) => {
    try {
      await api.post('/api/expense-categories', { name });
      await refresh();
      showToast(`Category "${name}" added`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add category');
    }
  };

  const removeExpenseCategory = async (id: string) => {
    try {
      await api.delete(`/api/expense-categories/${id}`);
      await refresh();
      showToast('Category removed');
    } catch {
      showToast('Could not remove category');
    }
  };

  const completeSale = async (method: string) => {
    try {
      await api.post('/api/sales', {
        paymentMethod: method,
        items: cart.map((c) => ({
          itemId: c.item.id, basePrice: c.item.basePrice, actualSalePrice: c.price,
        })),
      });
      setCart([]); setCheckout(false);
      await refresh();
      showToast('Sale completed');
    } catch {
      showToast('Sale could not be completed; an item may already be sold');
    }
  };

  const processRefund = async (saleId: string, reason: string) => {
    try {
      await api.post('/api/refunds', { saleId, reason });
      setShowRefund(null);
      await refresh();
      showToast('Refund processed — items restored to stock');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not process refund');
    }
  };

  // ============================================================
  // User management
  // ============================================================
  const refreshUsers = useCallback(async () => {
    const { data } = await authApi.listUsers();
    setUsers(data ?? []);
  }, []);

  const createUserHandler = async () => {
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    setCreatingUser(true);
    try {
      const { data } = await authApi.createUser(newUserName.trim(), newUserEmail.trim());
      // data.user includes role, data.pin is the generated PIN shown once
      setShowAddUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('attendant');
      setShowNewPin({ name: data!.user.name, pin: data!.pin });
      await refreshUsers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add person');
    } finally {
      setCreatingUser(false);
    }
  };

  const deactivateUserHandler = async (userId: string, name: string) => {
    if (!window.confirm(`Deactivate ${name}? They will no longer be able to sign in.`)) return;
    try {
      await authApi.deactivateUser(userId);
      await refreshUsers();
      showToast(`${name} deactivated`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not deactivate user');
    }
  };

  const handleUserUpdated = (user: User) => {
    setCurrentUser(user);
    setUsers((prev) => prev.map((u) => (
      u.id === user.id ? { ...u, name: user.name, email: user.email } : u
    )));
  };

  // ============================================================
  // Loading screen
  // ============================================================
  if (loading) {
    return (
      <motion.div
        className="loading"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="logoMark"
          variants={loadingPulse}
          initial="initial"
          animate="enter"
        >
          A
        </motion.div>
        <motion.div variants={loadingTextStagger} initial="initial" animate="enter">
          <motion.strong variants={loadingTextItem}>AliBeka</motion.strong>
          <motion.span variants={loadingTextItem}>
            Loading your shop
            <span className="dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </motion.span>
        </motion.div>
      </motion.div>
    );
  }

  // ============================================================
  // Auth gate
  // ============================================================
  if (isFirstRun === null) return null; // still checking session

  if (isFirstRun) {
    return <FirstRunWizard onSuccess={(user) => { setCurrentUser(user); setIsFirstRun(false); }} />;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={(user) => { setCurrentUser(user); }} />;
  }

  // ============================================================
  // Page render
  // ============================================================
  const isAdmin = currentUser.role === 'admin';
  return (
    <div className="appShell">
      <aside className="sidebar">
        <motion.div
          className="brand"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={smoothSpring}
        >
          <motion.div
            className="logoMark"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={snappySpring}
          >
            A
          </motion.div>
          <div>
            <strong>AliBeka</strong>
            <span>THRIFT & ACCESSORIES</span>
          </div>
        </motion.div>

        <div className="workflowLabel">SHOP WORKFLOW</div>
        <LayoutGroup id="sidebar-nav">
          <nav>
            <Nav active={tab === 'home'} icon={<BarChart3/>} text="Today" onClick={() => go('home')} index={0} />
            <Nav active={tab === 'receive'} icon={<Layers3/>} text="Receive & prepare" onClick={() => go('receive')} index={1} />
            <Nav active={tab === 'stock'} icon={<Package/>} text="Stock" onClick={() => go('stock')} index={2} />
            <Nav active={tab === 'sell'} icon={<ShoppingBag/>} text="Sell" onClick={() => go('sell')} index={3} />
            <Nav active={tab === 'review'} icon={<WalletCards/>} text="Review" onClick={() => go('review')} index={4} />
            {isAdmin && <Nav active={tab === 'expenses'} icon={<Banknote/>} text="Expenses" onClick={() => go('expenses')} index={5} />}
            {isAdmin && <Nav active={tab === 'report'} icon={<BarChart3/>} text="Reports" onClick={() => go('report')} index={6} />}
          </nav>
        </LayoutGroup>

        <div className="sidebarTools">
          {isAdmin && <Nav active={tab === 'settings'} icon={<Tag size={17}/>} text="Setup" onClick={() => go('settings')} index={7} isSetup />}
        </div>

        <motion.div
          className="sideFooter"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span className="onlineDot"/>Online
        </motion.div>
      </aside>

      <main className="main">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={smoothSpring}
        >
          <div className="titleWrap">
            <button className="mobileMenu" onClick={() => setMenu(!menu)}>
              <Menu size={20}/>
            </button>
            <div>
              <span className="eyebrow">ALIBEKA / {tabTitle(tab).toUpperCase()}</span>
              <h1>{tabTitle(tab)}</h1>
            </div>
          </div>
          <div className="headerActions">
            <AnimatePresence>
              {tab === 'sell' && (
                <motion.div
                  className="headerCart"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={bouncySpring}
                  key="header-cart"
                >
                  <ShoppingBag size={16}/>{cart.length}
                </motion.div>
              )}
            </AnimatePresence>
            <AccountBubble
              user={currentUser}
              onManage={() => setShowProfile(true)}
              onLogout={() => handleLogout()}
            />
          </div>
        </motion.header>

        <AnimatePresence>
          {menu && (
            <motion.div
              className="mobileNav"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Nav active={tab === 'home'} icon={<BarChart3/>} text="Today" onClick={() => go('home')} index={0} />
              <Nav active={tab === 'receive'} icon={<Layers3/>} text="Prepare" onClick={() => go('receive')} index={1} />
              <Nav active={tab === 'stock'} icon={<Package/>} text="Stock" onClick={() => go('stock')} index={2} />
              <Nav active={tab === 'sell'} icon={<ShoppingBag/>} text="Sell" onClick={() => go('sell')} index={3} />
              <Nav active={tab === 'review'} icon={<WalletCards/>} text="Review" onClick={() => go('review')} index={4} />
              {isAdmin && <Nav active={tab === 'expenses'} icon={<Banknote/>} text="Expenses" onClick={() => go('expenses')} index={5} />}
              {isAdmin && <Nav active={tab === 'report'} icon={<BarChart3/>} text="Reports" onClick={() => go('report')} index={6} />}
              {isAdmin && <Nav active={tab === 'settings'} icon={<Tag/>} text="Setup" onClick={() => go('settings')} index={7} />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page Content with Direction-aware Transitions */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={tab}
            custom={direction}
            variants={pageVariants(direction)}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            {tab === 'home' && (
              <Home
                bales={bales} items={items} available={available.length}
                revenue={revenue}
                onReceive={() => { go('receive'); setShowBale(true); }}
                onPrepare={() => { go('stock'); setShowItem(true); }}
                onSell={() => go('sell')}
              />
            )}
            {tab === 'receive' && (
              <Receive bales={bales} onAdd={() => setShowBale(true)}
                onPrepare={(b) => { go('stock'); setShowItem(true); }}/>
            )}
            {tab === 'stock' && (
              <Stock items={items} categories={categories} bales={bales}
                qualityLevels={qualityLevels} onAdd={() => setShowItem(true)}
                onEdit={(i) => setEditItem(i)}/>
            )}
            {tab === 'sell' && (
              <POS items={available} categories={categories}
                qualityLevels={qualityLevels} cart={cart} setCart={setCart}
                onSale={completeSale} checkout={checkout} setCheckout={setCheckout}/>
            )}
            {tab === 'review' && (
              <Review sales={sales} items={items} bales={bales}
                revenue={revenue} profit={profit}
                onRefund={(saleId, total) => setShowRefund({ saleId, total })}/>
            )}
            {tab === 'expenses' && (
              <Expenses expenses={expenses} expenseCategories={expenseCategories}
                onAdd={() => setShowExpense(true)} onDelete={removeExpense}
                onAddCategory={addExpenseCategory}
                onDeleteCategory={removeExpenseCategory}
                allExpenses={allExpenses} users={users} isAdmin={isAdmin}/>
            )}
            {tab === 'report' && <Report showToast={showToast} />}
            {tab === 'settings' && (
              <Setup categories={categories} rules={rules}
                qualityLevels={qualityLevels} qualityRecords={qualityRecords}
                onCat={() => setShowCats(true)}
                onRule={() => { setEditRule(null); setShowRule(true); }}
                onEditRule={(r) => { setEditRule(r); setShowRule(true); }}
                onCreateQuality={createQuality}
                onDeleteQuality={deleteQuality}
                users={users} currentUser={currentUser}
                deactivateUserHandler={deactivateUserHandler}
                setShowAddUser={setShowAddUser}/>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Modals */}
        <AnimatePresence>
          {showBale && (
            <Modal key="bale" title="1 · Receive a bale"
              subtitle="Record the purchase now, then either continue normally or create category-grouped drafts for later completion."
              close={() => setShowBale(false)}>
              <BaleForm today={today} categories={categories} onSave={createBale}/>
            </Modal>
          )}
          {showItem && (
            <Modal key="item" title="2 · Classify a piece"
              subtitle="Every physical piece gets its own inventory record. Photos are optional."
              close={() => setShowItem(false)}>
              <ItemForm bales={bales} categories={categories} rules={rules}
                qualityLevels={qualityLevels} onSave={createItem}/>
            </Modal>
          )}
          {showExpense && (
            <Modal key="expense" title="Add Expense"
              subtitle="Record a shop expense — rent, transport, packaging and more."
              close={() => setShowExpense(false)}>
              <ExpenseForm today={today} expenseCategories={expenseCategories}
                onSave={addExpense}/>
            </Modal>
          )}
          {showRefund && (
            <Modal key="refund" title={`Refund ${money(showRefund.total)}?`}
              subtitle="A refund creates a negative sale and restores the items to available stock."
              close={() => setShowRefund(null)}>
              <RefundForm
                total={showRefund.total}
                onConfirm={(reason) => processRefund(showRefund.saleId, reason)}
                onCancel={() => setShowRefund(null)}/>
            </Modal>
          )}
          {editItem && (
            <Modal key="edit-item"
              title={editItem.status === 'DRAFT' ? 'Complete this piece' : 'Edit inventory'}
              subtitle={editItem.status === 'DRAFT'
                ? 'Finish the details when you are ready. It will become available once category, size and quality are set.'
                : 'Correct the piece when its classification or price changes.'}
              close={() => setEditItem(null)}>
              <EditForm item={editItem} categories={categories}
                qualityLevels={qualityLevels}
                onSave={(p) => saveItem(editItem.id, p)}
                onUploadPhoto={(content, type) => uploadItemPhoto(editItem.id, content, type)}
                onRemovePhoto={() => removeItemPhoto(editItem.id)}/>
            </Modal>
          )}
          {showRule && (
            <Modal key="rule"
              title={editRule ? 'Edit base price' : 'Set base price'}
              subtitle="Reference price only. POS can sell higher or lower."
              close={() => { setShowRule(false); setEditRule(null); }}>
              <RuleForm rule={editRule} categories={categories}
                qualityLevels={qualityLevels} onSave={saveRule}/>
            </Modal>
          )}
          {showCats && (
            <Modal key="cats" title="Categories"
              subtitle="Shared by inventory, POS and pricing."
              close={() => setShowCats(false)}>
              <CategoryManager categories={categories} onClose={() => setShowCats(false)}
                onCreate={createCat} onRename={renameCat}/>
            </Modal>
          )}
          {showAddUser && (
            <Modal key="add-user" title="Add a person"
              subtitle="They'll sign in with this email and their default PIN."
              close={() => { if (!creatingUser) setShowAddUser(false); }}>
              <div className="fieldGroup">
                <label>Full name</label>
                <input value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g. Achieng Otieno" autoFocus/>
              </div>
              <div className="fieldGroup">
                <label>Email</label>
                <input type="email" value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="[email protected]"/>
              </div>
              <div className="fieldGroup">
                <label>Role</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button"
                    className={newUserRole === 'attendant' ? 'primary' : 'secondary'}
                    style={{ flex: 1, padding: '10px 14px' }}
                    onClick={() => setNewUserRole('attendant')}>
                    Attendant
                  </button>
                  <button type="button"
                    className={newUserRole === 'admin' ? 'primary' : 'secondary'}
                    style={{ flex: 1, padding: '10px 14px' }}
                    onClick={() => setNewUserRole('admin')}>
                    Admin
                  </button>
                </div>
                <small style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6, display: 'block' }}>
                  {newUserRole === 'admin'
                    ? 'Full access — user management, reports, all expenses, business settings.'
                    : 'Floor access — sales, expenses, add items to bales.'}
                </small>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button className="secondary" onClick={() => setShowAddUser(false)}
                  disabled={creatingUser}>Cancel</button>
                <button className="primary"
                  disabled={!newUserName.trim() || !newUserEmail.trim() || creatingUser}
                  onClick={createUserHandler}>
                  {creatingUser ? 'Creating…' : 'Create'}
                </button>
              </div>
            </Modal>
          )}
          {showNewPin && (
            <Modal key="new-pin" title={`${showNewPin.name} is onboard`}
              subtitle="Share this PIN with them. It's the only time it will be shown."
              close={() => setShowNewPin(null)}>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Default PIN
                </div>
                <div style={{
                  fontSize: 40, fontWeight: 700, letterSpacing: 8,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'var(--text-primary)',
                }}>
                  {showNewPin.pin}
                </div>
                <p style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                  They can sign in with this PIN now and change it later. They can also set a password from the login screen.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button className="primary" onClick={() => setShowNewPin(null)}>Got it</button>
              </div>
            </Modal>
          )}
          {showProfile && (
            <Modal key="profile" title="Your account"
              subtitle="Update your name and email, or change how you sign in."
              close={() => setShowProfile(false)}>
              <Profile currentUser={currentUser}
                onUserUpdated={handleUserUpdated}
                showToast={showToast}/>
            </Modal>
          )}
        </AnimatePresence>

        {/* Quick Sell FAB */}
        <motion.button
          className={`quickSell ${cart.length > 0 ? 'hasItems' : ''}`}
          onClick={() => go('sell')}
          aria-label="Quick sell"
          initial={{ y: 100, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ ...bouncySpring, delay: 0.5 }}
          whileHover={{ y: -4, scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ShoppingBag size={17}/><span>Quick sell</span>
        </motion.button>

        {/* Toast Stack */}
        <div className="toastStack">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                className="toast"
                variants={toastVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                layout
              >
                <Check size={16} style={{ color: 'var(--accent-glow)' }}/>
                {t.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// ============================================================
// Tab Title Helper
// ============================================================
function tabTitle(t: Tab) {
  return t === 'home' ? 'Today' : t === 'receive' ? 'Receive & prepare' :
         t === 'stock' ? 'Stock' : t === 'sell' ? 'Sell' :
         t === 'review' ? 'Review' : t === 'expenses' ? 'Expenses' :
         t === 'report' ? 'Reports' : 'Setup';
}

// ============================================================
// Nav Button (with layout-animated active indicator)
// ============================================================
function AccountBubble({user, onManage, onLogout}: {
  user: User;
  onManage: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const letter = (user.name.trim()[0] || '?').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="accountBubbleWrap" ref={wrapRef}>
      <button
        className="accountBubble"
        onClick={() => setOpen((v) => !v)}
        title={user.name}
        aria-label="Account"
        aria-expanded={open}
      >
        {letter}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="accountMenu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={snappySpring}
          >
            <div className="accountMenuHead">
              <span className="accountBubble" aria-hidden="true">{letter}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <button className="accountMenuItem" onClick={() => { setOpen(false); onManage(); }}>
              Manage account
            </button>
            <button className="accountMenuItem" onClick={() => { setOpen(false); onLogout(); }}>
              <LogOut size={15}/> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Nav({active, icon, text, onClick, index, isSetup = false}: {
  active: boolean; icon: React.ReactNode; text: string;
  onClick: () => void; index: number; isSetup?: boolean;
}) {
  return (
    <motion.button
      className={active ? 'active' : ''}
      onClick={onClick}
      custom={index}
      variants={navItemVariants}
      initial="initial"
      animate="enter"
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.97 }}
    >
      {icon}<span>{text}</span>
    </motion.button>
  );
}

// ============================================================
// Home Page
// ============================================================
function Home({bales, items, available, revenue, onReceive, onPrepare, onSell}: {
  bales: Bale[]; items: Item[]; available: number; revenue: number;
  onReceive: () => void; onPrepare: () => void; onSell: () => void;
}) {
  const latest = bales[0];
  const drafts = items.filter((i) => i.status === 'DRAFT').length;

  return (
    <div className="pageStack">
      <motion.section
        className="welcome"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={bouncySpring}
      >
        <div>
          <motion.span
            className="pill"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...bouncySpring, delay: 0.2 }}
          >
            YOUR SHOP, IN ORDER
          </motion.span>
          <h2>Know what to do next.</h2>
          <p>AliBeka follows the way stock moves through your shop — from bale to shelf to sale.</p>
        </div>
        <motion.div
          className="todayBox"
          animate={floatAnimation}
        >
          <span>TODAY'S SALES</span>
          <strong>KSh <CountUp value={revenue} format={(n) => Math.round(n).toLocaleString()}/></strong>
          <small>{available} pieces available</small>
        </motion.div>
      </motion.section>

      <section>
        <div className="sectionTitle">
          <div>
            <span className="eyebrow">THE FLOW</span>
            <h3>One step leads to the next</h3>
          </div>
        </div>
        <motion.div
          className="flowGrid"
          variants={flowCardStagger}
          initial="initial"
          animate="enter"
        >
          <Flow n="01" title="Receive bale" text="Record the purchase, count and supplier."
            action="Receive" onClick={onReceive} done={bales.length > 0}/>
          <Flow n="02" title="Sort & classify" text="Give each piece a category, size and quality."
            action={drafts ? `Complete ${drafts} drafts` : 'Add pieces'}
            onClick={onPrepare} done={items.length > 0 && !drafts}/>
          <Flow n="03" title="Sell" text="Browse available pieces, negotiate and checkout."
            action="Start sale" onClick={onSell} done={false}/>
        </motion.div>
      </section>

      <motion.section
        className="snapshot"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...bouncySpring, delay: 0.4 }}
      >
        <div>
          <span className="eyebrow">STOCK SNAPSHOT</span>
          <h3>{latest ? `Latest bale · ${latest.baleNumber}` : 'No bale yet'}</h3>
          <p>{latest
            ? `${latest.itemCount} pieces · ${latest.supplier} · ${money(latest.purchasePrice)}`
            : 'Start by receiving your first bale.'}</p>
        </div>
        <div className="snapStats">
          <span><b>{bales.length}</b>Bales</span>
          <span><b>{items.length}</b>Pieces</span>
          <span><b>{drafts}</b>To complete</span>
        </div>
      </motion.section>
    </div>
  );
}

// ============================================================
// Flow Card
// ============================================================
function Flow({n, title, text, action, onClick, done}: {
  n: string; title: string; text: string; action: string;
  onClick: () => void; done: boolean;
}) {
  return (
    <motion.article
      className={`flowCard ${done ? 'done' : ''}`}
      variants={flowCardItem}
      whileHover={hoverLift}
      whileTap={tapPress}
    >
      <div className="flowNum">{n}</div>
      <div className="flowBody">
        <div className="flowTop">
          <AnimatePresence>
            {done && (
              <motion.span
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={bouncySpring}
              >
                <Check size={16}/>
              </motion.span>
            )}
          </AnimatePresence>
          <strong>{title}</strong>
        </div>
        <p>{text}</p>
        <button className="secondary" onClick={onClick}>
          {action}<ArrowRight size={15}/>
        </button>
      </div>
    </motion.article>
  );
}

// ============================================================
// Receive Page
// ============================================================
function Receive({bales, onAdd, onPrepare}: {
  bales: Bale[]; onAdd: () => void; onPrepare: (b: Bale) => void;
}) {
  const b = bales[0];
  return (
    <section>
      <PageHead eyebrow="STEP 1" title="Receive a bale"
        text="Record each new bale once. After that, move into sorting and classification."
        action="Receive bale" onClick={onAdd}/>
      <motion.div
        className="nextPanel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...bouncySpring, delay: 0.1 }}
      >
        <div className="nextIcon"><Layers3/></div>
        <div>
          <span className="eyebrow">NEXT STEP</span>
          <h3>Sort & classify the pieces</h3>
          <p>Choose a bale, then add each physical item with its category, size and quality — or use quick intake and finish them later.</p>
        </div>
        {b && (
          <button className="primary" onClick={() => onPrepare(b)}>
            Continue <ChevronRight size={16}/>
          </button>
        )}
      </motion.div>

      <div className="sectionTitle">
        <div>
          <span className="eyebrow">RECEIVED</span>
          <h3>Your bales</h3>
        </div>
        <span className="resultCount">{bales.length}</span>
      </div>

      <motion.div
        className="list"
        variants={staggerContainer(0.06, 0.2)}
        initial="initial"
        animate="enter"
      >
        {bales.map((x) => (
          <motion.article
            className="listCard"
            key={x.id}
            variants={staggerItem}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="listIcon"><Layers3 size={18}/></div>
            <div className="listMain">
              <strong>{x.baleNumber}</strong>
              <p>{x.supplier} · {x.purchaseDate}</p>
            </div>
            <div className="listStat">
              <span>PIECES</span>
              <b>{x.itemCount}</b>
            </div>
            <div className="listStat">
              <span>PURCHASE</span>
              <b>{money(x.purchasePrice)}</b>
            </div>
          </motion.article>
        ))}
      </motion.div>

      <AnimatePresence>
        {!bales.length && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={bouncySpring}
          >
            <Empty title="No bales yet" text="Receive the first bale to start the inventory workflow."/>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ============================================================
// Rolodex
// ============================================================
function Rolodex({items, onSelect, index, setIndex}: {
  items: Item[]; onSelect: (i: Item) => void;
  index: number; setIndex: (n: number) => void;
}) {
  if (!items.length) return null;
  const active = Math.min(index, items.length - 1);
  const prev = (active - 1 + items.length) % items.length;
  const next = (active + 1) % items.length;

  const card = (i: number, position: 'left' | 'center' | 'right') => (
    <motion.button
      className={`rolodexCard ${position}`}
      onClick={() => setIndex(i)}
      animate={{
        scale: position === 'center' ? 1 : 0.85,
        opacity: position === 'center' ? 1 : 0.6,
        x: position === 'left' ? -120 : position === 'right' ? 120 : 0,
      }}
      transition={bouncySpring}
      whileHover={{ opacity: position === 'center' ? 1 : 0.85 }}
      whileTap={{ scale: 0.95 }}
      key={`${i}-${position}`}
    >
      <div className="rolodexVisual">
        {items[i].photoUrl ? (
          <img src={items[i].photoUrl} alt=""/>
        ) : (
          <div className="photoPlaceholder">
            <Camera size={25}/><span>Add photo later</span>
          </div>
        )}
        <span className="qualityTag">{items[i].quality || 'Draft'}</span>
      </div>
      <div className="rolodexInfo">
        <div>
          <strong>{items[i].name || items[i].category || 'Needs details'}</strong>
          <span>{items[i].category
            ? `${items[i].quality} · ${items[i].size} · ${items[i].id}`
            : `Draft · ${items[i].id}`}</span>
        </div>
        <b>{money(items[i].basePrice)}</b>
      </div>
    </motion.button>
  );

  return (
    <motion.div
      className="rolodexWrap"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncySpring}
    >
      <div className="rolodexTop">
        <div>
          <span className="eyebrow">VISUAL CLOSET</span>
          <h3>Browse this category</h3>
        </div>
        <span className="resultCount">{active + 1} / {items.length}</span>
      </div>
      <div className="rolodexStage">
        {items.length > 2 && card(prev, 'left')}
        {card(active, 'center')}
        {items.length > 1 && card(next, 'right')}
      </div>
      <div className="rolodexControls">
        <button className="secondary" onClick={() => setIndex(prev)}>Previous</button>
        <button className="secondary" onClick={() => setIndex(next)}>Next</button>
        <button className="primary" onClick={() => onSelect(items[active])}>
          Open item <ArrowRight size={15}/>
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================
// Stock Page
// ============================================================
function Stock({items, categories, bales, qualityLevels, onAdd, onEdit}: {
  items: Item[]; categories: string[]; bales: Bale[];
  qualityLevels: string[]; onAdd: () => void; onEdit: (i: Item) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [status, setStatus] = useState('ALL');
  const [ri, setRi] = useState(0);

  const list = items.filter((i) =>
    (status === 'ALL' || i.status === status) &&
    (cat === 'All' || i.category === cat) &&
    `${i.id} ${i.baleId} ${i.name || ''} ${i.category} ${i.quality} ${i.size}`
      .toLowerCase().includes(q.toLowerCase())
  );

  return (
    <section>
      <PageHead eyebrow="STEP 2 · 5" title="Sort, classify & keep stock ready"
        text="Every physical piece lives here. Add pieces after a bale arrives; photos can be added whenever you are ready."
        action="Add piece" onClick={onAdd}/>

      <motion.div
        className="nextPanel compact"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={smoothSpring}
      >
        <div className="nextIcon"><Tag/></div>
        <div>
          <span className="eyebrow">PRICING</span>
          <h3>Base prices are references</h3>
          <p>New pieces take the Category + Quality price. At sale time, the attendant can negotiate higher or lower.</p>
        </div>
      </motion.div>

      <LayoutGroup>
        <div className="categoryStrip">
          <motion.button
            className={cat === 'All' ? 'selected' : ''}
            onClick={() => { setCat('All'); setRi(0); }}
            whileTap={{ scale: 0.95 }}
          >
            All
          </motion.button>
          {categories.map((c) => (
            <motion.button
              className={cat === c ? 'selected' : ''}
              onClick={() => { setCat(c); setRi(0); }}
              key={c}
              whileTap={{ scale: 0.95 }}
            >
              {c}
            </motion.button>
          ))}
        </div>
      </LayoutGroup>

      <div className="filters">
        <div className="search">
          <Search size={17}/>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search item or bale"/>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All status</option>
          <option value="DRAFT">Needs details</option>
          <option value="AVAILABLE">Available</option>
          <option value="SOLD">Sold</option>
          <option value="REMOVED">Removed</option>
        </select>
      </div>

      <AnimatePresence mode="wait">
        <Rolodex key={`rolodex-${cat}`} items={list} onSelect={onEdit} index={ri} setIndex={setRi}/>
      </AnimatePresence>

      <motion.div
        className="itemGrid"
        variants={staggerContainer(0.05, 0.1)}
        initial="initial"
        animate="enter"
        key={`grid-${cat}-${status}`}
      >
        {list.map((i) => (
          <motion.button
            className="itemCard"
            key={i.id}
            variants={staggerItem}
            whileHover={hoverLift}
            whileTap={tapPress}
            layout
            onClick={() => onEdit(i)}
          >
            <div className="itemVisual">
              {i.photoUrl ? (
                <img src={i.photoUrl} alt=""/>
              ) : (
                <div className="photoPlaceholder">
                  <Camera size={20}/>
                  <span>{i.status === 'DRAFT' ? 'Add details later' : 'Photo optional'}</span>
                </div>
              )}
              <span className="qualityTag">{i.quality || 'Draft'}</span>
            </div>
            <div className="itemInfo">
              <div>
                <strong>{i.name || i.category || 'Needs details'}</strong>
                <span>{i.category
                  ? `${i.quality} · ${i.size} · ${i.id}`
                  : `Draft · ${i.id}`}</span>
              </div>
              <b>{money(i.basePrice)}</b>
            </div>
          </motion.button>
        ))}
      </motion.div>

      <AnimatePresence>
        {!list.length && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={bouncySpring}
          >
            <Empty title="Nothing here yet"
              text={bales.length ? 'Add the first piece from your bale.' : 'Receive a bale first.'}/>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ============================================================
// POS Page
// ============================================================
function POS({items, categories, qualityLevels, cart, setCart, onSale, checkout, setCheckout}: {
  items: Item[]; categories: string[]; qualityLevels: string[];
  cart: {item: Item; price: number}[]; setCart: (x: {item: Item; price: number}[]) => void;
  onSale: (m: string) => Promise<void>; checkout: boolean; setCheckout: (x: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [quality, setQuality] = useState('All');

  const list = items.filter((i) =>
    (cat === 'All' || i.category === cat) &&
    (quality === 'All' || i.quality === quality) &&
    `${i.id} ${i.name || ''} ${i.category} ${i.size} ${i.quality}`
      .toLowerCase().includes(q.toLowerCase())
  );

  const total = cart.reduce((a, c) => a + c.price, 0);
  const add = (i: Item) => {
    if (!cart.some((c) => c.item.id === i.id)) {
      setCart([...cart, { item: i, price: i.basePrice }]);
    }
  };
  const adjust = (n: number, d: number) => {
    const a = [...cart];
    a[n] = { ...a[n], price: Math.max(0, a[n].price + d) };
    setCart(a);
  };
  const remove = (id: string) => {
    setCart(cart.filter((x) => x.item.id !== id));
  };

  return (
    <div className="posLayout">
      <section>
        <PageHead eyebrow="STEP 6 · SELL" title="Choose pieces"
          text="Find the physical item, add it to the sale, then adjust the price if the customer bargains."/>
        <div className="filters">
          <div className="search">
            <Search size={17}/>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search item, category or size"/>
          </div>
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="All">All qualities</option>
            {qualityLevels.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <LayoutGroup>
          <div className="categoryStrip">
            <motion.button
              className={cat === 'All' ? 'selected' : ''}
              onClick={() => setCat('All')}
              whileTap={{ scale: 0.95 }}
            >
              All
            </motion.button>
            {categories.map((c) => (
              <motion.button
                className={cat === c ? 'selected' : ''}
                onClick={() => setCat(c)}
                key={c}
                whileTap={{ scale: 0.95 }}
              >
                {c}
              </motion.button>
            ))}
          </div>
        </LayoutGroup>
        <motion.div
          className="itemGrid"
          variants={staggerContainer(0.04, 0.1)}
          initial="initial"
          animate="enter"
          key={`pos-grid-${cat}-${quality}`}
        >
          {list.map((i) => (
            <motion.button
              className="itemCard"
              key={i.id}
              variants={staggerItem}
              whileHover={hoverLift}
              whileTap={tapPress}
              layout
              onClick={() => add(i)}
            >
              <div className="itemVisual">
                {i.photoUrl ? (
                  <img src={i.photoUrl} alt=""/>
                ) : (
                  <div className="photoPlaceholder">
                    <Camera size={20}/><span>No photo</span>
                  </div>
                )}
                <span className="qualityTag">{i.quality}</span>
              </div>
              <div className="itemInfo">
                <div>
                  <strong>{i.name || i.category}</strong>
                  <span>{i.quality} · {i.size}</span>
                </div>
                <b>{money(i.basePrice)}</b>
              </div>
            </motion.button>
          ))}
        </motion.div>
        <AnimatePresence>
          {!list.length && (
            <motion.div key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={bouncySpring}>
              <Empty title="No available pieces" text="Change the filters or add inventory."/>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="cart">
        <div className="cartHead">
          <div>
            <span className="eyebrow">CURRENT SALE</span>
            <h3>Cart <small>{cart.length}</small></h3>
          </div>
          {cart.length > 0 && (
            <motion.button
              className="iconBtn"
              onClick={() => setCart([])}
              whileHover={{ rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X/>
            </motion.button>
          )}
        </div>
        {!cart.length ? (
          <motion.div className="cartEmpty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={smoothSpring}>
            <ShoppingBag size={32}/>
            <strong>Start a sale</strong>
            <p>Choose an available piece to add it here.</p>
          </motion.div>
        ) : (
          <div className="cartItems">
            <AnimatePresence>
              {cart.map((c, n) => (
                <motion.div
                  className="cartItem"
                  key={c.item.id}
                  variants={cartItemVariants}
                  initial="initial"
                  animate="enter"
                  exit="exit"
                  layout
                >
                  <button onClick={() => remove(c.item.id)}><X size={15}/></button>
                  <div>
                    <strong>{c.item.name || c.item.category}</strong>
                    <span>{c.item.quality} · {c.item.size}</span>
                  </div>
                  <label>
                    <span>Actual price</span>
                    <div className="cartPriceTools">
                      <motion.button type="button" className="priceStep" onClick={() => adjust(n, -100)} whileTap={{ scale: 0.9 }}>−100</motion.button>
                      <motion.button type="button" className="priceStep" onClick={() => adjust(n, -50)} whileTap={{ scale: 0.9 }}>−50</motion.button>
                      <input type="number" min="0" value={c.price}
                        onChange={(e) => {
                          const a = [...cart];
                          a[n] = { ...c, price: Number(e.target.value) };
                          setCart(a);
                        }}/>
                      <motion.button type="button" className="priceStep" onClick={() => adjust(n, 50)} whileTap={{ scale: 0.9 }}>+50</motion.button>
                      <motion.button type="button" className="priceStep" onClick={() => adjust(n, 100)} whileTap={{ scale: 0.9 }}>+100</motion.button>
                    </div>
                  </label>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {cart.length > 0 && (
          <motion.div className="cartFooter"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={bouncySpring}>
            <div className="cartTotal">
              <span>Total</span>
              <strong>
                KSh <CountUp value={total} format={(n) => Math.round(n).toLocaleString()}/>
              </strong>
            </div>
            <button className="primary wide" onClick={() => setCheckout(true)}>
              Choose payment <ChevronRight size={16}/>
            </button>
          </motion.div>
        )}
        <AnimatePresence>
          {checkout && (
            <motion.div
              className="checkoutOverlay"
              variants={backdropVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              onMouseDown={(e) => { if (e.target === e.currentTarget) setCheckout(false); }}
            >
              <motion.div
                className="checkoutBox"
                variants={modalVariants}
                initial="initial"
                animate="enter"
                exit="exit"
              >
                <motion.button className="closeModal"
                  onClick={() => setCheckout(false)}
                  whileHover={{ rotate: 90 }}
                  whileTap={{ scale: 0.9 }}>
                  <X/>
                </motion.button>
                <span className="eyebrow">FINAL STEP</span>
                <h2>KSh <CountUp value={total} format={(n) => Math.round(n).toLocaleString()}/></h2>
                <p>How did the customer pay?</p>
                <motion.button className="payBtn"
                  onClick={() => onSale('M-Pesa')}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ ...smoothSpring, delay: 0.1 }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}>
                  <Smartphone/>
                  <span><b>M-Pesa</b><small>Record mobile money</small></span>
                  <ChevronRight/>
                </motion.button>
                <motion.button className="payBtn"
                  onClick={() => onSale('Cash')}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ ...smoothSpring, delay: 0.2 }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}>
                  <Banknote/>
                  <span><b>Cash</b><small>Record cash</small></span>
                  <ChevronRight/>
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

// ============================================================
// Review Page
// ============================================================
function Review({sales, items, bales, revenue, profit, onRefund}: {
  sales: Sale[]; items: Item[]; bales: Bale[];
  revenue: number; profit: number;
  onRefund: (saleId: string, total: number) => void;
}) {
  const sold = items.filter((i) => i.status === 'SOLD').length;
  const itemsSoldToday = sales
    .filter((s) => s.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((a, s) => a + s.items.length, 0);

  return (
    <section>
      <PageHead eyebrow="STEP 7 · REVIEW" title="Know what moved"
        text="Sales and stock information captured by the workflow, without extra data entry."/>

      <motion.div
        className="metricGrid"
        variants={staggerContainer(0.08, 0.1)}
        initial="initial"
        animate="enter"
      >
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>Today's revenue</span>
          <strong>KSh <CountUp value={revenue} format={(n) => Math.round(n).toLocaleString()}/></strong>
        </motion.div>
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>Gross profit (before expenses)</span>
          <strong>KSh <CountUp value={profit} format={(n) => Math.round(n).toLocaleString()}/></strong>
        </motion.div>
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>Items sold today</span>
          <strong><CountUp value={itemsSoldToday} format={(n) => String(Math.round(n))}/></strong>
        </motion.div>
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>Available pieces</span>
          <strong><CountUp value={items.filter((i) => i.status === 'AVAILABLE').length} format={(n) => String(Math.round(n))}/></strong>
        </motion.div>
      </motion.div>

      <motion.div
        className="reviewGrid"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...bouncySpring, delay: 0.3 }}
      >
        <div className="panel">
          <span className="eyebrow">INVENTORY</span>
          <h3>What is in the shop</h3>
          <p>{items.length} individual pieces across {bales.length} bales.</p>
          <p>{sold} sold · {items.filter((i) => i.status === 'AVAILABLE').length} available.</p>
        </div>
        <div className="panel">
          <span className="eyebrow">TRANSACTIONS</span>
          <h3>Recent sales</h3>
          {sales.slice(0, 6).map((s) => (
            <motion.div className={`saleRow ${s.isRefund ? 'refundRow' : ''}`} key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={smoothSpring}>
              <span>{new Date(s.createdAt).toLocaleString()} · {s.paymentMethod}{s.isRefund ? ' · Refund' : ''}</span>
              <span className="saleRowRight">
                <b>{money(s.total)}</b>
                {!s.isRefund && (
                  <motion.button className="refundBtn"
                    onClick={() => onRefund(s.id, s.total)}
                    whileTap={{ scale: 0.95 }}>
                    Refund
                  </motion.button>
                )}
              </span>
            </motion.div>
          ))}
          {!sales.length && <p>No sales yet.</p>}
        </div>
      </motion.div>
    </section>
  );
}

// ============================================================
// Profile Page
// ============================================================
function Profile({currentUser, onUserUpdated, showToast}: {
  currentUser: User;
  onUserUpdated: (user: User) => void;
  showToast: (message: string) => void;
}) {
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [savingDetails, setSavingDetails] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setName(currentUser.name);
    setEmail(currentUser.email);
  }, [currentUser.name, currentUser.email]);

  const detailsDirty =
    name.trim() !== currentUser.name ||
    email.trim().toLowerCase() !== currentUser.email.toLowerCase();

  const saveDetails = async () => {
    if (!name.trim() || !email.trim() || savingDetails) return;
    setSavingDetails(true);
    try {
      const { data } = await authApi.updateProfile(name.trim(), email.trim());
      onUserUpdated({ ...currentUser, ...data.user });
      showToast('Profile saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePin = async () => {
    if (savingPin) return;
    if (!/^\d{4,6}$/.test(newPin)) {
      showToast('PIN must be 4 to 6 digits');
      return;
    }
    if (newPin !== confirmPin) {
      showToast('PINs do not match');
      return;
    }
    setSavingPin(true);
    try {
      await authApi.changePin(newPin);
      onUserUpdated({ ...currentUser, hasPin: true });
      setNewPin('');
      setConfirmPin('');
      showToast(currentUser.hasPin ? 'PIN updated' : 'PIN set');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update PIN');
    } finally {
      setSavingPin(false);
    }
  };

  const savePassword = async () => {
    if (savingPassword) return;
    if (!newPassword || newPassword.length < 8) {
      showToast('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      onUserUpdated({ ...currentUser, hasPassword: true });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast(currentUser.hasPassword ? 'Password updated' : 'Password set');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const pinDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  return (
    <div className="form">
      <div className="panelHead" style={{ marginBottom: 0 }}>
        <span className="eyebrow">YOUR DETAILS</span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 4,
          background: currentUser.role === 'admin' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          color: currentUser.role === 'admin' ? '#a855f7' : '#3b82f6',
          fontSize: 11,
          fontWeight: 600,
        }}>{currentUser.role}</span>
      </div>
      <Field label="Full name">
        <input value={name} onChange={(e) => setName(e.target.value)}
          autoComplete="name"/>
      </Field>
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"/>
      </Field>
      <motion.button className="primary wide"
        disabled={!name.trim() || !email.trim() || !detailsDirty || savingDetails}
        onClick={saveDetails}
        whileTap={{ scale: 0.97 }}>
        {savingDetails ? 'Saving…' : 'Save details'}
      </motion.button>

      <span className="eyebrow" style={{ marginTop: 8 }}>{currentUser.hasPin ? 'CHANGE PIN' : 'SET A PIN'}</span>
      <Field label="New PIN">
        <input inputMode="numeric" autoComplete="new-password"
          value={newPin} onChange={(e) => setNewPin(pinDigits(e.target.value))}
          placeholder="4 to 6 digits"/>
      </Field>
      <Field label="Confirm PIN">
        <input inputMode="numeric" autoComplete="new-password"
          value={confirmPin} onChange={(e) => setConfirmPin(pinDigits(e.target.value))}
          placeholder="Repeat PIN"/>
      </Field>
      <motion.button className="primary wide"
        disabled={newPin.length < 4 || confirmPin.length < 4 || savingPin}
        onClick={savePin}
        whileTap={{ scale: 0.97 }}>
        {savingPin ? 'Saving…' : currentUser.hasPin ? 'Update PIN' : 'Set PIN'}
      </motion.button>

      <span className="eyebrow" style={{ marginTop: 8 }}>{currentUser.hasPassword ? 'CHANGE PASSWORD' : 'SET A PASSWORD'}</span>
      {currentUser.hasPassword && (
        <Field label="Current password">
          <input type="password" autoComplete="current-password"
            value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}/>
        </Field>
      )}
      <Field label="New password">
        <input type="password" autoComplete="new-password"
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"/>
      </Field>
      <Field label="Confirm password">
        <input type="password" autoComplete="new-password"
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat password"/>
      </Field>
      <motion.button className="primary wide"
        disabled={!newPassword || !confirmPassword || savingPassword}
        onClick={savePassword}
        whileTap={{ scale: 0.97 }}>
        {savingPassword ? 'Saving…' : currentUser.hasPassword ? 'Update password' : 'Set password'}
      </motion.button>
    </div>
  );
}

// ============================================================
// Setup Page
// ============================================================
function Setup({categories, rules, qualityLevels, qualityRecords, onCat, onRule, onEditRule, onCreateQuality, onDeleteQuality, users, currentUser, deactivateUserHandler, setShowAddUser}: {
  categories: string[]; rules: Rule[]; qualityLevels: string[];
  qualityRecords: {id: string; name: string}[];
  onCat: () => void; onRule: () => void; onEditRule: (r: Rule) => void;
  onCreateQuality: (name: string) => Promise<void>;
  onDeleteQuality: (id: string) => Promise<void>;
  users: User[]; currentUser: User | null;
  deactivateUserHandler: (userId: string, name: string) => void;
  setShowAddUser: (v: boolean) => void;
}) {
  const [open, setOpen] = useState<string | null>(categories[0] || null);
  const [newQuality, setNewQuality] = useState('');

  return (
    <section>
      <PageHead eyebrow="SETUP" title="Shop rules"
        text="Categories and reference prices live here. Pick a category first, then manage only the quality levels you use."/>

      <motion.div
        className="setupGrid"
        variants={staggerContainer(0.1, 0.1)}
        initial="initial"
        animate="enter"
      >
        <motion.div className="panel" variants={staggerItem}>
          <div className="panelHead">
            <div>
              <span className="eyebrow">CATEGORIES</span>
              <h3>{categories.length} categories</h3>
            </div>
            <button className="secondary" onClick={onCat}>
              <Plus size={15}/>Manage
            </button>
          </div>
          <div className="chipList">
            {categories.map((c) => <span key={c}>{c}</span>)}
          </div>
        </motion.div>

        <motion.div className="panel" variants={staggerItem}>
          <div className="panelHead">
            <div>
              <span className="eyebrow">QUALITY LEVELS</span>
              <h3>{qualityLevels.length} levels</h3>
            </div>
          </div>
          <div className="qualityManage">
            <div className="inlineAdd">
              <input value={newQuality} onChange={(e) => setNewQuality(e.target.value)}
                placeholder="Add quality level"/>
              <motion.button className="primary"
                disabled={!newQuality.trim()}
                onClick={async () => { await onCreateQuality(newQuality.trim()); setNewQuality(''); }}
                whileTap={{ scale: 0.95 }}>
                <Plus/>
              </motion.button>
            </div>
            {qualityRecords.map((q) => (
              <motion.div className="qualityManageRow" key={q.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={smoothSpring}>
                <span>{q.name}</span>
                <motion.button className="iconBtn danger"
                  title="Delete quality"
                  onClick={() => { if (window.confirm(`Delete ${q.name}?`)) onDeleteQuality(q.id); }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}>
                  <X size={15}/>
                </motion.button>
              </motion.div>
            ))}
          </div>
          <p className="qualityHint">A quality already used by inventory cannot be deleted.</p>
        </motion.div>

        <motion.div className="panel" variants={staggerItem}>
          <div className="panelHead">
            <div>
              <span className="eyebrow">BASE PRICES</span>
              <h3>Price by category</h3>
            </div>
            <button className="secondary" onClick={onRule}>
              <Plus size={15}/>Add price
            </button>
          </div>
          <p>These are reference prices for new pieces. The POS can always sell higher or lower.</p>
          <div className="priceCascade">
            {categories.map((c) => {
              const categoryRules = rules.filter((r) => r.category === c);
              const isOpen = open === c;
              return (
                <div className="cascadeCategory" key={c}>
                  <motion.button className="cascadeHeader"
                    onClick={() => setOpen(isOpen ? null : c)}
                    whileTap={{ scale: 0.99 }}>
                    <span>
                      <strong>{c}</strong>
                      <small>{categoryRules.length} quality {categoryRules.length === 1 ? 'level' : 'levels'} configured</small>
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 90 : 0 }}
                      transition={snappySpring}
                    >
                      <ChevronRight size={17}/>
                    </motion.span>
                  </motion.button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        className="cascadeBody"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        {categoryRules.length
                          ? categoryRules.map((r) => (
                              <motion.button className="qualityRule"
                                key={r.id} onClick={() => onEditRule(r)}
                                whileHover={{ x: 2 }}
                                whileTap={{ scale: 0.98 }}>
                                <span>
                                  <b>{r.quality}</b>
                                  <small>Reference price</small>
                                </span>
                                <strong>{money(r.basePrice)}</strong>
                                <Edit3 size={15}/>
                              </motion.button>
                            ))
                          : <div className="noRule">
                              <span>No quality prices yet.</span>
                              <button className="secondary" onClick={onRule}>Set a price</button>
                            </div>
                        }
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div className="panel" variants={staggerItem}>
          <div className="panelHead">
            <div>
              <span className="eyebrow">PEOPLE</span>
              <h3>{users.length} {users.length === 1 ? 'person' : 'people'}</h3>
            </div>
            <button className="secondary" onClick={() => setShowAddUser(true)}>
              <Plus size={15}/>Add person
            </button>
          </div>
          <p>Admins see everything. Attendants work the floor — bales, items, sales, their own expenses.</p>
          <div className="qualityManage">
            {users.map((u) => (
              <motion.div className="qualityManageRow" key={u.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={smoothSpring}>
                <span>
                  <strong>{u.name}</strong>
                  <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                    {u.email} · <span style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: u.role === 'admin' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: u.role === 'admin' ? '#a855f7' : '#3b82f6',
                      fontSize: 11,
                      fontWeight: 600,
                    }}>{u.role}</span>
                    {(u as any).active === false && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
                        fontSize: 11, fontWeight: 600 }}>inactive</span>
                    )}
                  </small>
                </span>
                {(u as any).active !== false && u.id !== currentUser?.id && (
                  <motion.button className="iconBtn danger"
                    title="Deactivate"
                    onClick={() => deactivateUserHandler(u.id, u.name)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}>
                    <X size={15}/>
                  </motion.button>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ============================================================
// Page Head
// ============================================================
function PageHead({eyebrow, title, text, action, onClick}: {
  eyebrow: string; title: string; text: string;
  action?: string; onClick?: () => void;
}) {
  return (
    <motion.div
      className="pageHead"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={smoothSpring}
    >
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {action && (
        <motion.button className="primary" onClick={onClick}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}>
          {action}<ArrowRight size={16}/>
        </motion.button>
      )}
    </motion.div>
  );
}

// ============================================================
// Modal (with Framer Motion spring animation)
// ============================================================
function Modal({title, subtitle, close, children}: {
  title: string; subtitle: string; close: () => void; children: React.ReactNode;
}) {
  return (
    <motion.div
      className="modalBackdrop"
      variants={backdropVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <motion.div
        className="modal"
        variants={modalVariants}
        initial="initial"
        animate="enter"
        exit="exit"
      >
        <motion.button
          className="closeModal"
          onClick={close}
          whileHover={{ rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={snappySpring}
        >
          <X/>
        </motion.button>
        <span className="eyebrow">ALIBEKA</span>
        <h2>{title}</h2>
        <p className="modalSubtitle">{subtitle}</p>
        {children}
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// Field Wrapper
// ============================================================
function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <label><span>{label}</span>{children}</label>;
}

// ============================================================
// Empty State (with floating icon)
// ============================================================
function Empty({title, text}: {title: string; text: string}) {
  return (
    <div className="empty">
      <motion.div animate={floatAnimation}>
        <Package size={42}/>
      </motion.div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

// ============================================================
// Bale Form
// ============================================================
function BaleForm({today, categories, onSave}: {
  today: string; categories: string[];
  onSave: (p: {
    purchaseDate: string; purchasePrice: number; itemCount: number;
    supplier: string; quick?: boolean; categoryCounts?: Record<string, number>;
  }) => Promise<void>;
}) {
  const [d, setD] = useState(today);
  const [p, setP] = useState('');
  const [n, setN] = useState('');
  const [s, setS] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});

  const total = categories.reduce((sum, c) => sum + (Number(counts[c]) || 0), 0);
  const valid = !!(d && p && s.trim());
  const quickValid = valid && total > 0;

  return (
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      if (valid) onSave({
        purchaseDate: d, purchasePrice: Number(p), itemCount: Number(n),
        supplier: s.trim(), quick: false,
      });
    }}>
      <Field label="Purchase date">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} required/>
      </Field>
      <Field label="Purchase price">
        <input type="number" min="0" value={p} onChange={(e) => setP(e.target.value)}
          placeholder="60,000" required/>
      </Field>
      <Field label="Number of items">
        <input type="number" min="1" value={n} onChange={(e) => setN(e.target.value)}
          placeholder="100" required/>
      </Field>
      <Field label="Supplier">
        <input value={s} onChange={(e) => setS(e.target.value)}
          placeholder="Supplier name" required/>
      </Field>
      <motion.button className="primary wide"
        disabled={!valid || !n}
        whileTap={{ scale: 0.97 }}>
        Save bale & continue
      </motion.button>
      <div className="quickCountPanel">
        <div>
          <span className="eyebrow">QUICK COUNT BY CATEGORY</span>
          <h3>Tell us what is in the bale</h3>
          <p>Count each category now. AliBeka creates drafts already grouped by category, so later you can work category by category.</p>
        </div>
        <div className="categoryCountList">
          {categories.map((c) => (
            <label className="categoryCountRow" key={c}>
              <span>{c}</span>
              <input type="number" min="0" inputMode="numeric"
                value={counts[c] || ''}
                onChange={(e) => setCounts({ ...counts, [c]: e.target.value })}
                placeholder="0"/>
            </label>
          ))}
        </div>
        <motion.div className="quickCountTotal"
          animate={total > 0 ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: 0.3 }}>
          <span>Total quick-counted</span>
          <strong>{total}</strong>
        </motion.div>
        <motion.button type="button" className="secondary wide"
          disabled={!quickValid}
          onClick={() => onSave({
            purchaseDate: d, purchasePrice: Number(p), itemCount: total,
            supplier: s.trim(), quick: true,
            categoryCounts: Object.fromEntries(
              Object.entries(counts).filter(([, v]) => Number(v) > 0)
                .map(([k, v]) => [k, Number(v)])
            ),
          })}
          whileTap={{ scale: 0.97 }}>
          Create {total || ''} category drafts — finish details later
        </motion.button>
      </div>
    </form>
  );
}

// ============================================================
// Item Form
// ============================================================
function ItemForm({bales, categories, rules, qualityLevels, onSave}: {
  bales: Bale[]; categories: string[]; rules: Rule[];
  qualityLevels: string[];
  onSave: (p: {
    baleId: string; name?: string; category: string; size: string;
    quality: string; basePrice?: number; photoData?: string; photoType?: string;
  }) => Promise<void>;
}) {
  const [b, setB] = useState(bales[0]?.id || '');
  const [name, setName] = useState('');
  const [c, setC] = useState(categories[0] || '');
  const [s, setS] = useState(sizes[0]);
  const [q, setQ] = useState(qualityLevels[0] || '');
  const [p, setP] = useState('');
  const [photo, setPhoto] = useState('');
  const [photoType, setPhotoType] = useState('');

  const rule = rules.find((r) => r.category === c && r.quality === q);

  return (
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      onSave({
        baleId: b, name, category: c, size: s, quality: q,
        basePrice: p ? Number(p) : undefined,
        photoData: photo || undefined, photoType: photoType || undefined,
      });
    }}>
      <Field label="Bale">
        <select value={b} onChange={(e) => setB(e.target.value)} required>
          {bales.map((x) => <option key={x.id} value={x.id}>{x.baleNumber}</option>)}
        </select>
      </Field>
      <Field label="Name / item label">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Optional, e.g. Black floral dress"/>
      </Field>
      <Field label="Category">
        <select value={c} onChange={(e) => setC(e.target.value)} required>
          {categories.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <div className="formRow">
        <Field label="Size">
          <select value={s} onChange={(e) => setS(e.target.value)}>
            {sizes.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Quality">
          <select value={q} onChange={(e) => setQ(e.target.value)} required>
            {qualityLevels.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label={`Base price ${rule ? '· suggested ' + money(rule.basePrice) : '· no rule yet'}`}>
        <input type="number" min="0" value={p} onChange={(e) => setP(e.target.value)}
          placeholder={rule ? String(rule.basePrice) : 'Enter reference price'}/>
      </Field>
      <PhotoPicker value={photo}
        onChange={(data, type) => { setPhoto(data); setPhotoType(type); }}/>
      <motion.button className="primary wide" whileTap={{ scale: 0.97 }}>
        Add piece
      </motion.button>
    </form>
  );
}

// ============================================================
// Edit Form
// ============================================================
function EditForm({item, categories, qualityLevels, onSave, onUploadPhoto, onRemovePhoto}: {
  item: Item; categories: string[]; qualityLevels: string[];
  onSave: (p: Partial<Item>) => Promise<void>;
  onUploadPhoto: (content: string, type: string) => Promise<void>;
  onRemovePhoto: () => Promise<void>;
}) {
  const [name, setName] = useState(item.name || '');
  const [c, setC] = useState(item.category);
  const [s, setS] = useState(item.size || '');
  const [q, setQ] = useState(item.quality || '');
  const [p, setP] = useState(String(item.basePrice || ''));
  const complete = !!(c && s && q);

  return (
    <div className="form">
      <Field label="Name / item label">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Optional description, e.g. Black floral dress"/>
      </Field>
      <Field label="Category">
        <select value={c} onChange={(e) => setC(e.target.value)}>
          {categories.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <div className="formRow">
        <Field label="Size">
          <select value={s} onChange={(e) => setS(e.target.value)}>
            <option value="">Choose size</option>
            {sizes.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Quality">
          <select value={q} onChange={(e) => setQ(e.target.value)}>
            <option value="">Choose quality</option>
            {qualityLevels.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Base price">
        <input type="number" min="0" value={p} onChange={(e) => setP(e.target.value)}/>
      </Field>
      <PhotoPicker value={item.photoUrl || ''}
        onChange={onUploadPhoto}
        onRemove={item.photoUrl ? onRemovePhoto : undefined}/>
      <p className="photoHint">Photo changes are saved immediately. You can keep editing this piece.</p>
      <motion.button className="primary wide"
        onClick={() => onSave({
          name, category: c, size: s, quality: q,
          basePrice: Number(p || 0), status: complete ? 'AVAILABLE' : 'DRAFT',
        })}
        whileTap={{ scale: 0.97 }}>
        {complete ? 'Save & make available' : 'Save as draft'}
      </motion.button>
    </div>
  );
}

// ============================================================
// Photo Picker
// ============================================================
function PhotoPicker({value, onChange, onRemove}: {
  value: string; onChange: (data: string, type: string) => void;
  onRemove?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(value);
  useEffect(() => setPreview(value), [value]);

  const handle = async (file: File) => {
    setBusy(true);
    try {
      const data = await compressPhoto(file);
      setPreview(`data:${data.type};base64,${data.base64}`);
      onChange(data.base64, data.type);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not process photo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photoField">
      <span className="fieldLabel">Photo · optional</span>
      <div className="photoEditor">
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.img
              key="preview"
              src={preview}
              alt="Item preview"
              style={{ width: '100%', height: 180, objectFit: 'cover' }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={smoothSpring}
            />
          ) : (
            <motion.div
              key="placeholder"
              className="photoPlaceholder"
              style={{ height: 180 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Camera size={22}/><span>No photo yet</span>
            </motion.div>
          )}
        </AnimatePresence>
        <label className="photoButton">
          {busy ? 'Processing…' : preview ? 'Replace photo' : 'Add photo'}
          <input type="file" accept="image/*" capture="environment" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
            e.currentTarget.value = '';
          }}/>
        </label>
        {onRemove && (
          <motion.button type="button" className="secondary" style={{ position: 'absolute', bottom: 12, left: 12, padding: '6px 12px', fontSize: 11 }}
            onClick={async () => { await onRemove(); setPreview(''); }}
            whileTap={{ scale: 0.95 }}>
            Remove photo
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Image Compression Utility
// ============================================================
async function compressPhoto(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image');
  const bitmap = await createImageBitmap(file);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process photo');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
  if (!blob) throw new Error('Could not compress photo');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.readAsDataURL(blob);
  });
  if (base64.length > 2500000) throw new Error('Photo is still too large; choose a smaller image');
  return { base64, type: 'image/webp' };
}

// ============================================================
// Rule Form
// ============================================================
function RuleForm({rule, categories, qualityLevels, onSave}: {
  rule: Rule | null; categories: string[]; qualityLevels: string[];
  onSave: (p: {category: string; quality: string; basePrice: number}) => Promise<void>;
}) {
  const [c, setC] = useState(rule?.category || categories[0] || '');
  const [q, setQ] = useState(rule?.quality || qualityLevels[0] || '');
  const [p, setP] = useState(rule ? String(rule.basePrice) : '');

  return (
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      if (c && q && p) onSave({ category: c, quality: q, basePrice: Number(p) });
    }}>
      <Field label="Category">
        <select value={c} onChange={(e) => setC(e.target.value)} disabled={!!rule}>
          {categories.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="Quality">
        <select value={q} onChange={(e) => setQ(e.target.value)} disabled={!!rule}>
          {qualityLevels.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="Reference base price">
        <input type="number" min="0" value={p} onChange={(e) => setP(e.target.value)}
          placeholder="1,000" required/>
      </Field>
      <div className="priceExplain">
        <b>Not a fixed selling price.</b>
        <span>The POS always allows the final price to be changed.</span>
      </div>
      <motion.button className="primary wide" whileTap={{ scale: 0.97 }}>
        {rule ? 'Update price rule' : 'Create price rule'}
      </motion.button>
    </form>
  );
}

// ============================================================
// Category Manager
// ============================================================
function CategoryManager({categories, onClose, onCreate, onRename}: {
  categories: string[]; onClose: () => void;
  onCreate: (n: string) => Promise<void>;
  onRename: (o: string, n: string) => Promise<void>;
}) {
  const [n, setN] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [e, setE] = useState('');

  return (
    <div className="form">
      <div className="inlineAdd">
        <input value={n} onChange={(x) => setN(x.target.value)} placeholder="New category"/>
        <motion.button className="primary"
          disabled={!n.trim()}
          onClick={async () => { await onCreate(n.trim()); setN(''); }}
          whileTap={{ scale: 0.95 }}>
          <Plus/>
        </motion.button>
      </div>
      {categories.map((c) => (
        <div className="categoryRow" key={c}>
          {editing === c ? (
            <input value={e} onChange={(x) => setE(x.target.value)} autoFocus/>
          ) : (
            <strong>{c}</strong>
          )}
          {editing === c ? (
            <motion.button className="secondary"
              onClick={async () => { if (e.trim()) { await onRename(c, e.trim()); setEditing(null); } }}
              whileTap={{ scale: 0.95 }}>
              Save
            </motion.button>
          ) : (
            <motion.button className="iconBtn"
              onClick={() => { setEditing(c); setE(c); }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}>
              <Edit3 size={15}/>
            </motion.button>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Expenses Page
// ============================================================
function Expenses({expenses, expenseCategories, onAdd, onDelete, onAddCategory, onDeleteCategory, allExpenses, users, isAdmin}: {
  expenses: Expense[]; expenseCategories: ExpenseCategory[];
  onAdd: () => void; onDelete: (id: string) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>; onDeleteCategory: (id: string) => Promise<void>;
  allExpenses?: Expense[]; users?: User[]; isAdmin?: boolean;
}) {
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expenseUserFilter, setExpenseUserFilter] = useState<string>('all');
  const addCategoryRef = useRef<HTMLInputElement>(null);

  // For admin, use allExpenses + user filter; for attendant, use already-filtered expenses
  const visibleExpenses = isAdmin
    ? (expenseUserFilter === 'all' ? (allExpenses || expenses) : (allExpenses || expenses).filter((e: any) => e.userId === expenseUserFilter))
    : expenses;

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const monthExpenses = visibleExpenses.filter((e) => e.expenseDate.startsWith(thisMonth));
  const monthTotal = monthExpenses.reduce((a, e) => a + e.amount, 0);
  const sorted = [...visibleExpenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));

  const startAddingCategory = () => {
    setAddingCategory(true);
    setTimeout(() => addCategoryRef.current?.focus(), 50);
  };

  const submitNewCategory = () => {
    const name = newCategoryName.trim();
    if (name) {
      onAddCategory(name);
      setNewCategoryName('');
      setAddingCategory(false);
    }
  };

  return (
    <section>
      <PageHead eyebrow="EXPENSES" title="Track what goes out"
        text="Rent, transport, packaging and other shop costs. Subtract from gross profit to see your real take-home."
        action="Add expense" onClick={onAdd}/>

      {isAdmin && users && users.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Filter by attendant:</label>
          <select
            value={expenseUserFilter}
            onChange={(e) => setExpenseUserFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1.5px solid var(--bg-secondary)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <option value="all">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      )}

      <motion.div className="metricGrid"
        variants={staggerContainer(0.08, 0.1)} initial="initial" animate="enter">
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>This month</span>
          <strong>KSh <CountUp value={monthTotal} format={(n) => Math.round(n).toLocaleString()}/></strong>
        </motion.div>
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>Total entries</span>
          <strong><CountUp value={visibleExpenses.length} format={(n) => String(Math.round(n))}/></strong>
        </motion.div>
        <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
          <span>This month count</span>
          <strong><CountUp value={monthExpenses.length} format={(n) => String(Math.round(n))}/></strong>
        </motion.div>
      </motion.div>

      {/* Category manager — chip row with + to add, × to remove */}
      <motion.div className="expenseCategoryBar"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={smoothSpring}>
        <span className="expenseCategoryLabel">Categories</span>
        <div className="expenseCategoryChips">
          {expenseCategories.map((c) => (
            <span key={c.id} className="expenseCategoryChip">
              {confirmDelete === c.id ? (
                <>
                  <span className="expenseCategoryConfirm">Remove?</span>
                  <motion.button className="expenseCategoryConfirmYes"
                    onClick={() => { setConfirmDelete(null); onDeleteCategory(c.id); }}
                    whileTap={{ scale: 0.9 }}>
                    Yes
                  </motion.button>
                  <motion.button className="expenseCategoryConfirmNo"
                    onClick={() => setConfirmDelete(null)}
                    whileTap={{ scale: 0.9 }}>
                    No
                  </motion.button>
                </>
              ) : (
                <>
                  {c.name}
                  <motion.button className="expenseCategoryRemove"
                    onClick={() => setConfirmDelete(c.id)}
                    whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}>
                    <X size={11}/>
                  </motion.button>
                </>
              )}
            </span>
          ))}
          {addingCategory ? (
            <span className="expenseCategoryAddInline">
              <input ref={addCategoryRef} type="text" value={newCategoryName}
                placeholder="Category name"
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitNewCategory(); }
                  if (e.key === 'Escape') { setNewCategoryName(''); setAddingCategory(false); }
                }}
                onBlur={() => { if (!newCategoryName.trim()) setAddingCategory(false); }}/>
              <motion.button className="expenseCategoryConfirmYes"
                onMouseDown={(e) => { e.preventDefault(); submitNewCategory(); }}
                whileTap={{ scale: 0.9 }}>
                Add
              </motion.button>
            </span>
          ) : (
            <motion.button className="expenseCategoryAdd"
              onClick={startAddingCategory}
              whileTap={{ scale: 0.95 }}>
              <Plus size={13}/>
            </motion.button>
          )}
        </div>
      </motion.div>

      <motion.div className="panel" initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }} transition={bouncySpring}>
        <span className="eyebrow">ALL EXPENSES</span>
        <h3>Recent entries</h3>
        {sorted.length === 0 && <p>No expenses recorded yet.</p>}
        {sorted.slice(0, 50).map((e) => {
          const expUser = users?.find((u) => u.id === (e as any).userId);
          return (
            <motion.div className="saleRow" key={e.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={smoothSpring}>
              <span>
                <strong>{e.description}</strong>
                <em className="muted"> · {e.category} · {e.expenseDate}{isAdmin && expUser ? ` · by ${expUser.name}` : ''}</em>
              </span>
              <span className="saleRowRight">
                <b>{money(e.amount)}</b>
                <motion.button className="iconBtn danger"
                  title="Delete expense"
                  onClick={() => onDelete(e.id)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}>
                  <X size={14}/>
                </motion.button>
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

function ExpenseForm({today, expenseCategories, onSave}: {
  today: string;
  expenseCategories: ExpenseCategory[];
  onSave: (p: { description: string; category: string; amount: number; expenseDate: string }) => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(expenseCategories[0]?.name || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const canSave = description.trim() && category.trim() && Number(amount) >= 0 && date;

  return (
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      if (canSave) onSave({
        description: description.trim(),
        category,
        amount: Number(amount),
        expenseDate: date,
      });
    }}>
      <Field label="Description">
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Bus fare to market" required/>
      </Field>
      <Field label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} required>
          {expenseCategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Amount (KSh)">
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="500" required/>
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required/>
      </Field>
      <motion.button className="primary wide" disabled={!canSave} whileTap={{ scale: 0.97 }}>
        Save expense
      </motion.button>
    </form>
  );
}

// ============================================================
// Reports Page
// ============================================================
type PeriodReport = {
  from: string; to: string;
  totalRevenue: number; totalRefunds: number; netRevenue: number;
  totalExpenses: number; grossProfit: number; netProfit: number;
  itemCount: number; baleCount: number;
  topCategories: Array<{ category: string; count: number; revenue: number }>;
};

function getRange(preset: 'today' | 'week' | 'month' | 'year'): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === 'today') return { from: iso(today), to: iso(today) };
  if (preset === 'week') {
    const d = new Date(today);
    d.setDate(today.getDate() - 6);
    return { from: iso(d), to: iso(today) };
  }
  if (preset === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(d), to: iso(today) };
  }
  const d = new Date(today.getFullYear(), 0, 1);
  return { from: iso(d), to: iso(today) };
}

function Report({showToast}: {
  showToast: (message: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (f: string, t: string) => {
    setLoading(true);
    try {
      const r = await api.get<PeriodReport>(`/api/reports/period?from=${f}&to=${t}`);
      setReport(r.data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(from, to); }, [from, to]);

  const setPreset = (preset: 'today' | 'week' | 'month' | 'year') => {
    const r = getRange(preset);
    setFrom(r.from);
    setTo(r.to);
  };

  return (
    <section>
      <PageHead eyebrow="STEP 8 · REPORTS" title="See the period, not the day"
        text="A day's profit hides the truth. A week, month, or year shows whether the shop is actually making money."/>

      <motion.div className="reportDateBar"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={smoothSpring}>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to}/>
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} max={today}/>
        </Field>
        <div className="reportPresets">
          <motion.button className="secondary"
            onClick={() => setPreset('today')} whileTap={{ scale: 0.95 }}>
            Today
          </motion.button>
          <motion.button className="secondary"
            onClick={() => setPreset('week')} whileTap={{ scale: 0.95 }}>
            This week
          </motion.button>
          <motion.button className="secondary"
            onClick={() => setPreset('month')} whileTap={{ scale: 0.95 }}>
            This month
          </motion.button>
          <motion.button className="secondary"
            onClick={() => setPreset('year')} whileTap={{ scale: 0.95 }}>
            This year
          </motion.button>
        </div>
      </motion.div>

      {loading && <p className="muted reportStatus">Loading report…</p>}

      {report && !loading && (
        <>
          <motion.div className="metricGrid"
            variants={staggerContainer(0.08, 0.1)}
            initial="initial" animate="enter">
            <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Net revenue</span>
              <strong>KSh <CountUp value={report.netRevenue} format={(n) => Math.round(n).toLocaleString()}/></strong>
            </motion.div>
            <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Gross profit</span>
              <strong>KSh <CountUp value={report.grossProfit} format={(n) => Math.round(n).toLocaleString()}/></strong>
            </motion.div>
            <motion.div className="metric metricAccent" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Net profit (after expenses)</span>
              <strong>KSh <CountUp value={report.netProfit} format={(n) => Math.round(n).toLocaleString()}/></strong>
            </motion.div>
            <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Total expenses</span>
              <strong>KSh <CountUp value={report.totalExpenses} format={(n) => Math.round(n).toLocaleString()}/></strong>
            </motion.div>
            <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Refunds</span>
              <strong>KSh <CountUp value={report.totalRefunds} format={(n) => Math.round(n).toLocaleString()}/></strong>
            </motion.div>
            <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Items sold</span>
              <strong><CountUp value={report.itemCount} format={(n) => String(Math.round(n))}/></strong>
            </motion.div>
            <motion.div className="metric" variants={staggerItem} whileHover={{ y: -4 }}>
              <span>Bales received</span>
              <strong><CountUp value={report.baleCount} format={(n) => String(Math.round(n))}/></strong>
            </motion.div>
          </motion.div>

          <motion.div className="panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...bouncySpring, delay: 0.3 }}>
            <span className="eyebrow">TOP CATEGORIES</span>
            <h3>Revenue by category</h3>
            {report.topCategories.length === 0
              ? <p>No sales in this period.</p>
              : report.topCategories.map((c) => (
                  <motion.div className="categoryRow" key={c.category}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={smoothSpring}>
                    <strong>{c.category}</strong>
                    <span className="muted">{c.count} sold</span>
                    <b>{money(c.revenue)}</b>
                  </motion.div>
                ))}
          </motion.div>

          <motion.p className="reportFooter muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}>
            Range: {report.from} → {report.to}
          </motion.p>
        </>
      )}
    </section>
  );
}

// ============================================================
// Refund Form
// ============================================================
function RefundForm({total, onConfirm, onCancel}: {
  total: number; onConfirm: (reason: string) => Promise<void>; onCancel: () => void;
}) {
  const [reason, setReason] = useState<'Wrong item' | 'Customer changed mind' | 'Defective' | 'Other'>('Wrong item');
  const [busy, setBusy] = useState(false);
  const reasons: Array<'Wrong item' | 'Customer changed mind' | 'Defective' | 'Other'> =
    ['Wrong item', 'Customer changed mind', 'Defective', 'Other'];

  return (
    <div className="form">
      <div className="refundTotal">
        <span>Sale total</span>
        <strong>{money(total)}</strong>
        <small>This will be reversed and items returned to stock.</small>
      </div>
      <div className="refundReasons">
        {reasons.map((r) => (
          <label key={r} className={`refundReasonOption ${reason === r ? 'selected' : ''}`}>
            <input type="radio" name="refundReason" value={r}
              checked={reason === r}
              onChange={() => setReason(r)}/>
            <span>{r}</span>
          </label>
        ))}
      </div>
      <div className="refundActions">
        <motion.button type="button" className="secondary"
          onClick={onCancel} whileTap={{ scale: 0.95 }}>
          Cancel
        </motion.button>
        <motion.button type="button" className="primary"
          disabled={busy}
          onClick={async () => { setBusy(true); await onConfirm(reason); setBusy(false); }}
          whileTap={{ scale: 0.95 }}>
          Confirm refund
        </motion.button>
      </div>
    </div>
  );
}
