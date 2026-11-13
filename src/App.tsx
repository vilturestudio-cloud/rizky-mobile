import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CreditCard,
  Home,
  Plus,
  ScanLine,
  UserRound,
  Wallet,
  X,
  Trash2,
} from "lucide-react";
import "./App.css";

type Account = {
  id: string;
  bank: string;
  nickname: string;
  number: string;
  openingBalance: number;
  kind: "Bank" | "E-Wallet";
};

type StoredAccount = Omit<Account, "openingBalance"> & {
  openingBalance?: number;
  balance?: number;
};

type Transaction = {
  id: string;
  accountId: string;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  date: string;
};

type BankOption = {
  name: string;
  label: string;
  style: string;
  kind: "Bank" | "E-Wallet";
};

const accountOptions: BankOption[] = [
  { name: "BCA", label: "BCA", style: "bank-bca", kind: "Bank" },
  { name: "Mandiri", label: "MANDIRI", style: "bank-mandiri", kind: "Bank" },
  { name: "BRI", label: "BRI", style: "bank-bri", kind: "Bank" },
  { name: "BNI", label: "BNI", style: "bank-bni", kind: "Bank" },
  { name: "SeaBank", label: "SEABANK", style: "bank-seabank", kind: "Bank" },
  { name: "Neobank", label: "NEOBANK", style: "bank-neobank", kind: "Bank" },
  { name: "Bank Jago", label: "JAGO", style: "bank-jago", kind: "Bank" },
  { name: "CIMB Niaga", label: "CIMB", style: "bank-cimb", kind: "Bank" },
  { name: "Permata", label: "PERMATA", style: "bank-permata", kind: "Bank" },
  { name: "GoPay", label: "GoPay", style: "wallet-gopay", kind: "E-Wallet" },
  { name: "DANA", label: "DANA", style: "wallet-dana", kind: "E-Wallet" },
  { name: "OVO", label: "OVO", style: "wallet-ovo", kind: "E-Wallet" },
  {
    name: "ShopeePay",
    label: "ShopeePay",
    style: "wallet-shopee",
    kind: "E-Wallet",
  },
  {
    name: "LinkAja",
    label: "LinkAja",
    style: "wallet-linkaja",
    kind: "E-Wallet",
  },
];

const ACCOUNT_KEY = "vilture-finance-accounts-v2";
const TRANSACTION_KEY = "vilture-finance-transactions-v2";

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    readStorage<Transaction[]>(TRANSACTION_KEY, []),
  );

  const [accounts, setAccounts] = useState<Account[]>(() => {
    const storedAccounts = readStorage<StoredAccount[]>(ACCOUNT_KEY, []);
    const storedTransactions = readStorage<Transaction[]>(TRANSACTION_KEY, []);

    return storedAccounts.map((account) => {
      // Rekening yang sudah menggunakan format baru tidak perlu dimigrasikan.
      if (typeof account.openingBalance === "number") {
        return account as Account;
      }

      // Saldo lama dikurangi dampak transaksi yang sudah tercatat.
      const transactionNet = storedTransactions
        .filter((item) => item.accountId === account.id)
        .reduce(
          (total, item) =>
            total + (item.type === "income" ? item.amount : -item.amount),
          0,
        );

      return {
        ...account,
        openingBalance: (account.balance ?? 0) - transactionNet,
      };
    });
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const saved = readStorage<Account[]>(ACCOUNT_KEY, []);
    return saved[0]?.id ?? null;
  });
  const [activeTab, setActiveTab] = useState("Home");
  const showBalance = true;
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [toast, setToast] = useState("");
  const swipeStartX = useRef<number | null>(null);

  const [accountKind, setAccountKind] = useState<"Bank" | "E-Wallet">("Bank");
  const [bank, setBank] = useState("BCA");
  const [nickname, setNickname] = useState("");
  const [number, setNumber] = useState("");
  const [balance, setBalance] = useState("");

  const [transactionTitle, setTransactionTitle] = useState("");
  const [transactionCategory, setTransactionCategory] =
    useState("Food & Drink");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionType, setTransactionType] = useState<"expense" | "income">(
    "expense",
  );

  useEffect(() => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem(TRANSACTION_KEY, JSON.stringify(transactions));
  }, [transactions]);

  const selectedAccount =
    accounts.find((item) => item.id === selectedId) ?? null;

  const accountBalances = useMemo(() => {
    return accounts.reduce<Record<string, number>>((result, account) => {
      const transactionNet = transactions
        .filter((item) => item.accountId === account.id)
        .reduce(
          (total, item) =>
            total + (item.type === "income" ? item.amount : -item.amount),
          0,
        );

      result[account.id] = account.openingBalance + transactionNet;

      return result;
    }, {});
  }, [accounts, transactions]);

  const getAccountBalance = (accountId: string) =>
    accountBalances[accountId] ?? 0;

  const selectedTransactions = useMemo(
    () =>
      transactions
        .filter((item) => item.accountId === selectedId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, selectedId],
  );

  const selectedBank =
    accountOptions.find((item) => item.name === bank) ?? accountOptions[0];

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const addAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const option = accountOptions.find((item) => item.name === bank);
    if (!option) return;

    const newAccount: Account = {
      id: crypto.randomUUID(),
      bank,
      nickname: nickname.trim() || bank,
      number: number.trim(),
      openingBalance: Number(balance) || 0,
      kind: accountKind,
    };

    setAccounts((current) => [...current, newAccount]);
    setSelectedId(newAccount.id);
    setShowAccountModal(false);
    setNickname("");
    setNumber("");
    setBalance("");
    setBank(accountKind === "Bank" ? "BCA" : "GoPay");
    notify("Rekening berhasil ditambahkan");
  };

  const addTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAccount) {
      notify("Tambahkan rekening terlebih dahulu");
      return;
    }

    const amount = Number(transactionAmount);
    if (!amount || amount <= 0) return;

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      accountId: selectedAccount.id,
      title: transactionTitle.trim(),
      category: transactionCategory,
      amount,
      type: transactionType,
      date: new Date().toISOString(),
    };

    setTransactions((current) => [transaction, ...current]);

    setShowTransactionModal(false);
    setTransactionTitle("");
    setTransactionAmount("");
    notify("Transaksi berhasil disimpan");
  };

  const deleteAccount = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    if (!account) return;

    if (!window.confirm(`Hapus rekening ${account.nickname}?`)) return;

    setAccounts((current) => current.filter((item) => item.id !== id));
    setTransactions((current) =>
      current.filter((item) => item.accountId !== id),
    );

    if (selectedId === id) {
      const remaining = accounts.filter((item) => item.id !== id);
      setSelectedId(remaining[0]?.id ?? null);
    }

    notify("Rekening berhasil dihapus");
  };

  const handleTab = (tab: string) => {
    setActiveTab(tab);
    if (tab === "Scan")
      notify("Fitur scan struk akan kita aktifkan berikutnya");
  };

  const getOption = (name: string) =>
    accountOptions.find((item) => item.name === name) ?? accountOptions[0];

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date));

  const activeCardIndex = accounts.findIndex(
    (account) => account.id === selectedId,
  );

  const moveCard = (direction: number) => {
    if (accounts.length <= 1) return;

    const currentIndex = Math.max(0, activeCardIndex);
    const nextIndex =
      (currentIndex + direction + accounts.length) % accounts.length;

    setSelectedId(accounts[nextIndex].id);
  };

  const handleSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = event.touches[0].clientX;
  };

  const handleSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null) return;

    const difference = event.changedTouches[0].clientX - swipeStartX.current;

    if (difference > 45) moveCard(-1);
    if (difference < -45) moveCard(1);

    swipeStartX.current = null;
  };

  return (
    <main className="phone-shell">
      <div className="app-screen">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">V</div>
            <div>
              <div className="brand-name">VILTURE</div>
              <div className="brand-caption">FINANCE</div>
            </div>
          </div>
          <button
            className="icon-button notification-button"
            aria-label="Notifications"
            onClick={() => notify("Belum ada notifikasi")}
          >
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
        </header>

        {activeTab === "Home" && (
          <div className="page-content">
            <section className="section-block cards-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">YOUR ACCOUNTS</p>
                  <h2>My cards</h2>
                </div>
                <button
                  className="text-action"
                  onClick={() => setActiveTab("Cards")}
                >
                  Manage <ChevronRight size={15} />
                </button>
              </div>

              {accounts.length > 0 ? (
                <>
                  <div
                    className="card-stack"
                    onTouchStart={handleSwipeStart}
                    onTouchEnd={handleSwipeEnd}
                  >
                    <button
                      className="card-arrow card-arrow-left"
                      onClick={() => moveCard(-1)}
                      disabled={accounts.length <= 1}
                      aria-label="Previous account"
                    >
                      <ChevronRight size={19} />
                    </button>

                    {accounts.map((account, index) => {
                      const option = getOption(account.bank);
                      const relativeIndex =
                        (index - activeCardIndex + accounts.length) %
                        accounts.length;

                      let positionClass = "card-hidden";

                      if (relativeIndex === 0) positionClass = "card-front";
                      else if (relativeIndex === 1)
                        positionClass = "card-back-right";
                      else if (relativeIndex === accounts.length - 1)
                        positionClass = "card-back-left";

                      return (
                        <button
                          key={account.id}
                          className={`bank-card ${option.style} ${positionClass}`}
                          onClick={() => setSelectedId(account.id)}
                          tabIndex={
                            relativeIndex <= 1 ||
                            relativeIndex === accounts.length - 1
                              ? 0
                              : -1
                          }
                        >
                          {account.bank === "Mandiri" ? (
                            <div className="mandiri-card-content">
                              <div className="mandiri-account-name">
                                {account.nickname}
                              </div>

                              <div className="mandiri-card-number">
                                •••• •••• ••••{" "}
                                {account.number.slice(-4) || "0000"}
                              </div>

                              <div className="mandiri-card-balance">
                                {showBalance
                                  ? rupiah(getAccountBalance(account.id))
                                  : "••••••••"}
                              </div>
                            </div>
                          ) : (
                            <>
                              {account.bank === "Mandiri" ? (
                                <div className="mandiri-card-content">
                                  <span className="mandiri-account-name">
                                    {account.nickname}
                                  </span>

                                  <span className="mandiri-card-number">
                                    •••• •••• ••••{" "}
                                    {account.number.slice(-4) || "0000"}
                                  </span>

                                  <strong className="mandiri-card-balance">
                                    {showBalance
                                      ? rupiah(getAccountBalance(account.id))
                                      : "••••••••"}
                                  </strong>
                                </div>
                              ) : (
                                <>
                                  <div className="bank-card-top">
                                    <span className="bank-card-brand">
                                      {option.label}
                                    </span>
                                    <span className="card-chip" />
                                  </div>

                                  <div className="card-account-name">
                                    {account.nickname}
                                  </div>

                                  <div className="card-number">
                                    •••• •••• ••••{" "}
                                    {account.number.slice(-4) || "0000"}
                                  </div>

                                  <div className="bank-card-bottom">
                                    <span>{account.kind.toUpperCase()}</span>
                                    <strong>
                                      {showBalance
                                        ? rupiah(getAccountBalance(account.id))
                                        : "••••••••"}
                                    </strong>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}

                    <button
                      className="card-arrow card-arrow-right"
                      onClick={() => moveCard(1)}
                      disabled={accounts.length <= 1}
                      aria-label="Next account"
                    >
                      <ChevronRight size={19} />
                    </button>
                  </div>

                  <div className="carousel-footer">
                    <div className="carousel-dots">
                      {accounts.map((account) => (
                        <span
                          key={account.id}
                          className={
                            account.id === selectedId ? "active-dot" : ""
                          }
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <button
                  className="empty-account"
                  onClick={() => setShowAccountModal(true)}
                >
                  <div className="empty-icon">
                    <CreditCard size={24} />
                  </div>
                  <div className="empty-account-copy">
                    <strong>Belum ada rekening</strong>
                    <span>Tambahkan bank atau e-wallet pertamamu</span>
                  </div>
                  <div className="empty-add">
                    <Plus size={19} />
                  </div>
                </button>
              )}
            </section>

            {/* TRANSACTION SHORTCUTS */}
            <section className="transaction-shortcuts">
              <button
                onClick={() => {
                  setTransactionType("expense");
                  setShowTransactionModal(true);
                }}
                disabled={!selectedAccount}
              >
                <span className="shortcut-icon expense-shortcut">
                  <ArrowUpRight size={21} />
                </span>
                <span>Expense</span>
              </button>

              <button
                onClick={() => {
                  setTransactionType("income");
                  setShowTransactionModal(true);
                }}
                disabled={!selectedAccount}
              >
                <span className="shortcut-icon income-shortcut">
                  <ArrowDownLeft size={21} />
                </span>
                <span>Income</span>
              </button>

              <button
                onClick={() =>
                  notify("Fitur Savings akan kita buat berikutnya")
                }
              >
                <span className="shortcut-icon savings-shortcut">
                  <Wallet size={21} />
                </span>
                <span>Savings</span>
              </button>
            </section>

            {/* SELECTED ACCOUNT BALANCE */}
            <section className="total-section">
              <div className="total-label">TOTAL SALDO</div>

              <div className="total-value">
                {selectedAccount
                  ? showBalance
                    ? rupiah(getAccountBalance(selectedAccount.id))
                    : "••••••••"
                  : "Rp 0"}
              </div>

              <div className="total-description">
                {selectedAccount
                  ? selectedAccount.nickname
                  : "Pilih rekening untuk melihat saldo"}
              </div>
            </section>

            <section className="section-block activity-preview">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ACCOUNT HISTORY</p>
                  <h2>Recent activity</h2>
                  <p className="history-account-name">
                    {selectedAccount
                      ? selectedAccount.nickname
                      : "Pilih rekening untuk melihat transaksi"}
                  </p>
                </div>
                <button
                  className="text-action"
                  onClick={() => setActiveTab("Activity")}
                >
                  See all <ChevronRight size={15} />
                </button>
              </div>

              {selectedTransactions.length > 0 ? (
                <div className="transaction-list">
                  {selectedTransactions.slice(0, 5).map((transaction) => (
                    <div className="transaction-item" key={transaction.id}>
                      <div className={`transaction-icon ${transaction.type}`}>
                        {transaction.type === "income" ? (
                          <ArrowDownLeft size={19} />
                        ) : (
                          <ArrowUpRight size={19} />
                        )}
                      </div>
                      <div className="transaction-copy">
                        <strong>{transaction.title}</strong>
                        <span>
                          {transaction.category} ·{" "}
                          {formatDate(transaction.date)}
                        </span>
                      </div>
                      <strong
                        className={`transaction-amount ${transaction.type}`}
                      >
                        {transaction.type === "income" ? "+" : "-"}
                        {rupiah(transaction.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <Activity size={21} />
                  </div>
                  <strong>
                    {selectedAccount
                      ? "No activity yet"
                      : "Belum ada rekening dipilih"}
                  </strong>
                  <span>
                    {selectedAccount
                      ? `Transaksi ${selectedAccount.nickname} akan muncul di sini.`
                      : "Tambahkan rekening untuk mulai mencatat transaksi."}
                  </span>
                  {selectedAccount && (
                    <button
                      className="small-action"
                      onClick={() => setShowTransactionModal(true)}
                    >
                      <Plus size={14} /> Add transaction
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "Cards" && (
          <div className="page-content secondary-page">
            <p className="eyebrow">YOUR ACCOUNTS</p>
            <h1>My cards</h1>
            <p className="subheading">
              Kelola semua rekening bank dan e-wallet.
            </p>

            {accounts.length === 0 ? (
              <div className="large-empty">
                <CreditCard size={30} />
                <strong>Belum ada rekening</strong>
                <span>Tambahkan rekening untuk mulai mengelola asetmu.</span>
              </div>
            ) : (
              <div className="manage-account-list">
                {accounts.map((account) => {
                  const option = getOption(account.bank);
                  return (
                    <div className="manage-account-item" key={account.id}>
                      <button
                        className={`mini-bank-card ${option.style}`}
                        onClick={() => {
                          setSelectedId(account.id);
                          setActiveTab("Home");
                        }}
                      >
                        <span>{option.label}</span>
                        <small>•••• {account.number.slice(-4) || "0000"}</small>
                      </button>
                      <div className="manage-account-copy">
                        <strong>{account.nickname}</strong>
                        <span>
                          {account.bank} · {account.kind}
                        </span>
                        <b>
                          {showBalance
                            ? rupiah(getAccountBalance(account.id))
                            : "••••••"}
                        </b>
                      </div>
                      <button
                        className="delete-button"
                        onClick={() => deleteAccount(account.id)}
                        aria-label="Hapus rekening"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="primary-button full-button"
              onClick={() => setShowAccountModal(true)}
            >
              <Plus size={17} /> Add new account
            </button>
          </div>
        )}

        {activeTab === "Activity" && (
          <div className="page-content secondary-page">
            <p className="eyebrow">MONEY MOVEMENT</p>
            <h1>Activity</h1>
            <p className="subheading">
              {selectedAccount
                ? `Riwayat ${selectedAccount.nickname}`
                : "Pilih rekening untuk melihat riwayat."}
            </p>

            {accounts.length > 0 && (
              <div className="account-filter">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    className={selectedId === account.id ? "filter-active" : ""}
                    onClick={() => setSelectedId(account.id)}
                  >
                    {account.nickname}
                  </button>
                ))}
              </div>
            )}

            {selectedTransactions.length > 0 ? (
              <div className="transaction-list activity-full-list">
                {selectedTransactions.map((transaction) => (
                  <div className="transaction-item" key={transaction.id}>
                    <div className={`transaction-icon ${transaction.type}`}>
                      {transaction.type === "income" ? (
                        <ArrowDownLeft size={19} />
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                    </div>
                    <div className="transaction-copy">
                      <strong>{transaction.title}</strong>
                      <span>
                        {transaction.category} · {formatDate(transaction.date)}
                      </span>
                    </div>
                    <strong
                      className={`transaction-amount ${transaction.type}`}
                    >
                      {transaction.type === "income" ? "+" : "-"}
                      {rupiah(transaction.amount)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="large-empty">
                <Activity size={30} />
                <strong>Belum ada transaksi</strong>
                <span>
                  Riwayat transaksi rekening terpilih akan muncul di sini.
                </span>
                {selectedAccount && (
                  <button
                    className="primary-button"
                    onClick={() => setShowTransactionModal(true)}
                  >
                    <Plus size={16} /> Add transaction
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "Profile" && (
          <div className="page-content secondary-page">
            <p className="eyebrow">PREFERENCES</p>
            <h1>Profile</h1>
            <p className="subheading">Pengaturan personal VILTURE Finance.</p>
            <div className="profile-panel">
              <div className="profile-avatar">V</div>
              <div>
                <strong>Personal workspace</strong>
                <span>VILTURE Finance</span>
              </div>
            </div>
            <div className="settings-row">
              <span>Data storage</span>
              <strong>Local device</strong>
            </div>
            <div className="settings-row">
              <span>Accounts</span>
              <strong>{accounts.length}</strong>
            </div>
            <div className="settings-row">
              <span>Transactions</span>
              <strong>{transactions.length}</strong>
            </div>
          </div>
        )}

        <nav className="bottom-nav">
          <button
            className={activeTab === "Home" ? "nav-active" : ""}
            onClick={() => handleTab("Home")}
          >
            <Home size={20} />
            <span>Home</span>
          </button>
          <button
            className={activeTab === "Cards" ? "nav-active" : ""}
            onClick={() => handleTab("Cards")}
          >
            <CreditCard size={20} />
            <span>Cards</span>
          </button>
          <button className="scan-nav-button" onClick={() => handleTab("Scan")}>
            <span>
              <ScanLine size={22} />
            </span>
            <small>Scan</small>
          </button>
          <button
            className={activeTab === "Activity" ? "nav-active" : ""}
            onClick={() => handleTab("Activity")}
          >
            <Activity size={20} />
            <span>Activity</span>
          </button>
          <button
            className={activeTab === "Profile" ? "nav-active" : ""}
            onClick={() => handleTab("Profile")}
          >
            <UserRound size={20} />
            <span>Profile</span>
          </button>
        </nav>
      </div>

      {showAccountModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowAccountModal(false)}
        >
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW ACCOUNT</p>
                <h2>Add account</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowAccountModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={addAccount}>
              <label>Account type</label>
              <div className="type-switch">
                <button
                  type="button"
                  className={accountKind === "Bank" ? "type-active" : ""}
                  onClick={() => {
                    setAccountKind("Bank");
                    setBank("BCA");
                  }}
                >
                  Bank account
                </button>
                <button
                  type="button"
                  className={accountKind === "E-Wallet" ? "type-active" : ""}
                  onClick={() => {
                    setAccountKind("E-Wallet");
                    setBank("GoPay");
                  }}
                >
                  E-wallet
                </button>
              </div>

              <label>Choose provider</label>
              <div className="bank-picker">
                {accountOptions
                  .filter((item) => item.kind === accountKind)
                  .map((item) => (
                    <button
                      type="button"
                      key={item.name}
                      className={
                        bank === item.name
                          ? "bank-option chosen"
                          : "bank-option"
                      }
                      onClick={() => setBank(item.name)}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>

              <label htmlFor="account-name">Account name</label>
              <input
                id="account-name"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Contoh: Tabungan utama"
                required
              />

              <label htmlFor="account-number">Account number / phone</label>
              <input
                id="account-number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="Nomor rekening atau HP"
                inputMode="numeric"
              />

              <label htmlFor="account-balance">Current balance</label>
              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="account-balance"
                  value={balance}
                  onChange={(event) =>
                    setBalance(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="0"
                  inputMode="numeric"
                  required
                />
              </div>

              <div className="modal-preview">
                <span>Selected provider</span>
                <strong>{selectedBank.name}</strong>
              </div>
              <button className="primary-button full-button" type="submit">
                Save account
              </button>
            </form>
          </div>
        </div>
      )}

      {showTransactionModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowTransactionModal(false)}
        >
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW RECORD</p>
                <h2>Add transaction</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowTransactionModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={addTransaction}>
              <div className="transaction-type-switch">
                <button
                  type="button"
                  className={
                    transactionType === "expense" ? "expense-active" : ""
                  }
                  onClick={() => {
                    setTransactionType("expense");
                    setTransactionCategory("Food & Drink");
                  }}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={
                    transactionType === "income" ? "income-active" : ""
                  }
                  onClick={() => {
                    setTransactionType("income");
                    setTransactionCategory("Salary");
                  }}
                >
                  Income
                </button>
              </div>
              <label>Account</label>
              <div className="modal-preview">
                <span>Selected account</span>
                <strong>{selectedAccount?.nickname ?? "None"}</strong>
              </div>
              <label htmlFor="transaction-title">Description</label>
              <input
                id="transaction-title"
                value={transactionTitle}
                onChange={(event) => setTransactionTitle(event.target.value)}
                placeholder="Contoh: Makan siang"
                required
              />
              <label>Category</label>
              <select
                value={transactionCategory}
                onChange={(event) => setTransactionCategory(event.target.value)}
              >
                {(transactionType === "expense"
                  ? [
                      "Food & Drink",
                      "Transportation",
                      "Shopping",
                      "Bills & Utilities",
                      "Entertainment",
                      "Health",
                      "Education",
                      "Housing",
                      "Other",
                    ]
                  : [
                      "Salary",
                      "Business",
                      "Freelance",
                      "Investment",
                      "Gift",
                      "Other Income",
                    ]
                ).map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
              <label htmlFor="transaction-amount">Amount</label>
              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="transaction-amount"
                  value={transactionAmount}
                  onChange={(event) =>
                    setTransactionAmount(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="0"
                  inputMode="numeric"
                  required
                />
              </div>
              <button className="primary-button full-button" type="submit">
                Save transaction
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast-message">{toast}</div>}
    </main>
  );
}

export default App;
