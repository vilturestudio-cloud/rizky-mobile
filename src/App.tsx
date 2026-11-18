import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownUp,
  ArrowUpRight,
  Bell,
  Camera,
  CalendarDays,
  ImagePlus,
  Zap,
  ChevronRight,
  CreditCard,
  Home,
  Target,
  ChartPie,
  Coins,
  Plus,
  Pencil,
  Repeat,
  ScanLine,
  Search,
  SlidersHorizontal,
  UserRound,
  Wallet,
  X,
  Trash2,
} from "lucide-react";
import "./App.css";
import { createWorker } from "tesseract.js";
import { ensureAnonymousSession, supabase } from "./supabase";

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
  categoryId: string | null;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  date: string;
};

type RecurringTransaction = {
  id: string;
  accountId: string;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  intervalValue: number;
  startDate: string;
  nextDueDate: string;
  notes: string;
  isActive: boolean;
};

type AccountTransfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  transferDate: string;
};

type BillReminder = {
  id: string;
  accountId: string;
  title: string;
  category: string;
  amount: number;
  frequency: "once" | "weekly" | "monthly" | "yearly";
  intervalValue: number;
  nextDueDate: string;
  reminderDaysBefore: number;
  notes: string;
  lastPaidAt: string | null;
  isActive: boolean;
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  icon: string | null;
};

type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  createdAt: string;
};

type GoalContribution = {
  id: string;
  goalId: string;
  amount: number;
  note: string;
  contributedAt: string;
};

type SavingsPocket = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

type SavingsMovement = {
  id: string;
  pocketId: string;
  type: "deposit" | "withdrawal";
  amount: number;
  note: string;
  movementDate: string;
};

type Budget = {
  id: string;
  accountId: string;
  categoryId: string;
  budgetMonth: string;
  amount: number;
  createdAt: string;
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

const toLocalDateOnly = (value: string | Date) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [transferDate, setTransferDate] = useState(() =>
    toLocalDateOnly(new Date()),
  );
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

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

  const [categories, setCategories] = useState<Category[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [savingsPockets, setSavingsPockets] = useState<SavingsPocket[]>([]);
  const [savingsMovements, setSavingsMovements] = useState<SavingsMovement[]>(
    [],
  );
  const [selectedSavingsPocketId, setSelectedSavingsPocketId] = useState<
    string | null
  >(null);

  const [showSavingsPocketModal, setShowSavingsPocketModal] = useState(false);
  const [savingsPocketName, setSavingsPocketName] = useState("");
  const [savingsPocketDescription, setSavingsPocketDescription] = useState("");
  const [isSavingSavingsPocket, setIsSavingSavingsPocket] = useState(false);
  const [showSavingsMovementModal, setShowSavingsMovementModal] =
    useState(false);
  const [savingsMovementType, setSavingsMovementType] = useState<
    "deposit" | "withdrawal"
  >("deposit");
  const [savingsMovementAmount, setSavingsMovementAmount] = useState("");
  const [savingsMovementNote, setSavingsMovementNote] = useState("");
  const [savingsMovementDate, setSavingsMovementDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isSavingSavingsMovement, setIsSavingSavingsMovement] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const [recurringTransactions, setRecurringTransactions] = useState<
    RecurringTransaction[]
  >([]);

  const [billReminders, setBillReminders] = useState<BillReminder[]>([]);
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [isConfirmingBill, setIsConfirmingBill] = useState<string | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState<string | null>(null);

  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(
    null,
  );
  const [isSavingRecurring, setIsSavingRecurring] = useState(false);

  const [recurringTitle, setRecurringTitle] = useState("");
  const [recurringAccountId, setRecurringAccountId] = useState("");
  const [recurringCategory, setRecurringCategory] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringType, setRecurringType] = useState<"income" | "expense">(
    "expense",
  );
  const [recurringFrequency, setRecurringFrequency] =
    useState<RecurringTransaction["frequency"]>("monthly");
  const [recurringInterval, setRecurringInterval] = useState("1");
  const [recurringStartDate, setRecurringStartDate] = useState(() =>
    toLocalDateOnly(new Date()),
  );
  const [recurringNotes, setRecurringNotes] = useState("");
  const [billTitle, setBillTitle] = useState("");
  const [billAccountId, setBillAccountId] = useState("");
  const [billCategory, setBillCategory] = useState("Bills & Utilities");
  const [billAmount, setBillAmount] = useState("");
  const [billFrequency, setBillFrequency] =
    useState<BillReminder["frequency"]>("monthly");
  const [billInterval, setBillInterval] = useState("1");
  const [billDueDate, setBillDueDate] = useState(() =>
    toLocalDateOnly(new Date()),
  );
  const [billReminderDays, setBillReminderDays] = useState("3");
  const [billNotes, setBillNotes] = useState("");

  const [budgetMonth, setBudgetMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [isDeletingBudget, setIsDeletingBudget] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const [budgetAccountId, setBudgetAccountId] = useState("");
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  const [selectedSavingsGoalId, setSelectedSavingsGoalId] = useState<
    string | null
  >(null);
  const [goalContributions, setGoalContributions] = useState<
    GoalContribution[]
  >([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null);

  const [isDeletingGoal, setIsDeletingGoal] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTargetAmount, setGoalTargetAmount] = useState("");
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [editingContribution, setEditingContribution] =
    useState<GoalContribution | null>(null);
  const [editContributionAmount, setEditContributionAmount] = useState("");
  const [editContributionNote, setEditContributionNote] = useState("");

  const [contributionToDelete, setContributionToDelete] =
    useState<GoalContribution | null>(null);

  const [isUpdatingContribution, setIsUpdatingContribution] = useState(false);
  const [isDeletingContribution, setIsDeletingContribution] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionNote, setContributionNote] = useState("");
  const [isSavingContribution, setIsSavingContribution] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"expense" | "income">(
    "expense",
  );
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const saved = readStorage<Account[]>(ACCOUNT_KEY, []);
    return saved[0]?.id ?? null;
  });
  const [activeTab, setActiveTab] = useState("Home");
  const [activityView, setActivityView] = useState<
    "transactions" | "transfers"
  >("transactions");

  const [transferAccountFilter, setTransferAccountFilter] = useState("all");
  const [activityAccountFilter, setActivityAccountFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [showActivityFilters, setShowActivityFilters] = useState(false);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<
    "all" | "income" | "expense"
  >("all");
  const showBalance = true;
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [transactionToDelete, setTransactionToDelete] =
    useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const filteredActivityTransactions = useMemo(() => {
    const keyword = activitySearch.trim().toLowerCase();

    return transactions
      .filter((item) => {
        const matchesAccount =
          activityAccountFilter === "all" ||
          item.accountId === activityAccountFilter;

        const matchesType =
          transactionTypeFilter === "all" ||
          item.type === transactionTypeFilter;

        const matchesSearch =
          !keyword ||
          item.title.toLowerCase().includes(keyword) ||
          item.category.toLowerCase().includes(keyword);

        return matchesAccount && matchesType && matchesSearch;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    transactions,
    activityAccountFilter,
    transactionTypeFilter,
    activitySearch,
  ]);

  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState("");
  const swipeStartX = useRef<number | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showScanCamera, setShowScanCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCloudReady, setIsCloudReady] = useState(false);
  const [cloudError, setCloudError] = useState("");

  const [accountKind, setAccountKind] = useState<"Bank" | "E-Wallet">("Bank");
  const [bank, setBank] = useState("BCA");
  const [nickname, setNickname] = useState("");
  const [number, setNumber] = useState("");
  const [balance, setBalance] = useState("");

  const [transactionTitle, setTransactionTitle] = useState("");
  const [transactionCategory, setTransactionCategory] =
    useState("Food & Drink");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() =>
    toLocalDateOnly(new Date().toISOString()),
  );
  const [transactionType, setTransactionType] = useState<"expense" | "income">(
    "expense",
  );

  // Ambil data cloud saat aplikasi dibuka. Jika akun cloud masih kosong,
  // data lokal lama akan dimigrasikan satu kali ke akun anonim perangkat ini.
  useEffect(() => {
    let cancelled = false;

    const initializeCloud = async () => {
      try {
        const session = await ensureAnonymousSession();
        const uid = session.user.id;
        if (cancelled) return;
        setUserId(uid);

        const [
          accountsResult,
          transactionsResult,
          categoriesResult,
          savingsGoalsResult,
          savingsPocketsResult,
          savingsMovementsResult,
          contributionsResult,
          budgetsResult,
        ] = await Promise.all([
          supabase.from("accounts").select("*").eq("user_id", uid),
          supabase.from("transactions").select("*").eq("user_id", uid),
          supabase.from("categories").select("*").eq("user_id", uid),
          supabase.from("savings_goals").select("*").eq("user_id", uid),
          supabase.from("goal_contributions").select("*").eq("user_id", uid),
          supabase
            .from("budgets")
            .select("*")
            .eq("user_id", uid)
            .order("budget_month", { ascending: false }),
          supabase
            .from("savings_pockets")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", { ascending: false }),

          supabase
            .from("savings_movements")
            .select("*")
            .eq("user_id", uid)
            .order("movement_date", { ascending: false }),
        ]);

        if (accountsResult.error) throw accountsResult.error;
        if (transactionsResult.error) throw transactionsResult.error;
        if (categoriesResult.error) throw categoriesResult.error;
        if (savingsGoalsResult.error) throw savingsGoalsResult.error;
        if (contributionsResult.error) throw contributionsResult.error;
        if (budgetsResult.error) throw budgetsResult.error;
        if (savingsPocketsResult.error) throw savingsPocketsResult.error;
        if (savingsMovementsResult.error) throw savingsMovementsResult.error;

        let cloudAccounts = accountsResult.data ?? [];
        let cloudTransactions = transactionsResult.data ?? [];
        let cloudCategories = categoriesResult.data ?? [];

        const cloudGoals = savingsGoalsResult.data ?? [];
        const cloudContributions = contributionsResult.data ?? [];

        setBudgets(
          (budgetsResult.data ?? []).map((item) => ({
            id: item.id,
            accountId: item.account_id,
            categoryId: item.category_id,
            budgetMonth: item.budget_month,
            amount: Number(item.amount),
            createdAt: item.created_at,
          })),
        );

        const defaultCategories: Omit<Category, "id">[] = [
          { name: "Food & Drink", type: "expense", icon: null },
          { name: "Transportation", type: "expense", icon: null },
          { name: "Shopping", type: "expense", icon: null },
          { name: "Bills & Utilities", type: "expense", icon: null },
          { name: "Entertainment", type: "expense", icon: null },
          { name: "Health", type: "expense", icon: null },
          { name: "Education", type: "expense", icon: null },
          { name: "Housing", type: "expense", icon: null },
          { name: "Other", type: "expense", icon: null },
          { name: "Salary", type: "income", icon: null },
          { name: "Business", type: "income", icon: null },
          { name: "Freelance", type: "income", icon: null },
          { name: "Investment", type: "income", icon: null },
          { name: "Gift", type: "income", icon: null },
          { name: "Other Income", type: "income", icon: null },
        ];

        // Buat kategori default hanya jika pengguna belum memiliki kategori.
        if (cloudCategories.length === 0) {
          const categoryRows = defaultCategories.map((category) => ({
            ...category,
            user_id: uid,
          }));

          const { data, error } = await supabase
            .from("categories")
            .insert(categoryRows)
            .select("*");

          if (error) throw error;

          cloudCategories = data ?? [];
        }

        // Migrasi rekening lokal jika akun cloud belum memiliki rekening.
        if (cloudAccounts.length === 0 && accounts.length > 0) {
          const accountRows = accounts.map((account) => ({
            id: account.id,
            user_id: uid,
            bank: account.bank,
            nickname: account.nickname,
            account_number: account.number,
            opening_balance: account.openingBalance,
            kind: account.kind,
          }));

          const { error } = await supabase.from("accounts").insert(accountRows);
          if (error) throw error;
          cloudAccounts = accountRows;
        }

        // Migrasi transaksi lokal setelah rekening tersedia di cloud.
        if (cloudTransactions.length === 0 && transactions.length > 0) {
          const availableAccountIds = new Set(
            cloudAccounts.map((item: any) => item.id),
          );
          const transactionRows = transactions
            .filter((item) => availableAccountIds.has(item.accountId))
            .map((transaction) => ({
              id: transaction.id,
              user_id: uid,
              account_id: transaction.accountId,
              category: transaction.category,
              type: transaction.type,
              amount: transaction.amount,
              description: transaction.title,
              transaction_date: toLocalDateOnly(transaction.date),
            }));

          if (transactionRows.length > 0) {
            const { error } = await supabase
              .from("transactions")
              .insert(transactionRows);
            if (error) throw error;
            cloudTransactions = transactionRows;
          }
        }

        if (cancelled) return;

        setAccounts(
          cloudAccounts.map((account: any) => ({
            id: account.id,
            bank: account.bank,
            nickname: account.nickname,
            number: account.account_number ?? "",
            openingBalance: Number(account.opening_balance ?? 0),
            kind: account.kind,
          })),
        );
        setSelectedId((currentId) =>
          cloudAccounts.some((account: any) => account.id === currentId)
            ? currentId
            : (cloudAccounts[0]?.id ?? null),
        );

        setTransactions(
          cloudTransactions.map((transaction: any) => ({
            id: transaction.id,
            accountId: transaction.account_id,
            categoryId:
              transaction.category_id ??
              cloudCategories.find(
                (category: any) =>
                  category.name === transaction.category &&
                  category.type === transaction.type,
              )?.id ??
              null,
            title: transaction.description ?? "",
            category: transaction.category ?? "Lainnya",
            amount: Number(transaction.amount),
            type: transaction.type,
            date: `${transaction.transaction_date}T12:00:00`,
          })),
        );

        // Hubungkan transaksi lama dengan kategori Supabase
        for (const category of cloudCategories) {
          const { error: backfillError } = await supabase
            .from("transactions")
            .update({ category_id: category.id })
            .eq("user_id", uid)
            .eq("category", category.name)
            .eq("type", category.type)
            .is("category_id", null);

          if (backfillError) {
            console.error("Gagal menghubungkan kategori:", backfillError);
          }
        }

        setCategories(
          cloudCategories.map((category: any) => ({
            id: category.id,
            name: category.name,
            type: category.type,
            icon: category.icon ?? null,
          })),
        );

        setSavingsGoals(
          cloudGoals.map((goal: any) => ({
            id: goal.id,
            name: goal.name,
            targetAmount: Number(goal.target_amount),
            currentAmount: Number(goal.current_amount),
            targetDate: goal.target_date ?? null,
            createdAt: goal.created_at,
          })),
        );

        setGoalContributions(
          cloudContributions.map((item: any) => ({
            id: item.id,
            goalId: item.goal_id,
            amount: Number(item.amount),
            note: item.note ?? "",
            contributedAt: item.contributed_at,
          })),
        );
        setSavingsPockets(
          (savingsPocketsResult.data ?? []).map((item: any) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? "",
            createdAt: item.created_at,
          })),
        );

        setSavingsMovements(
          (savingsMovementsResult.data ?? []).map((item: any) => ({
            id: item.id,
            pocketId: item.pocket_id,
            type: item.type,
            amount: Number(item.amount),
            note: item.note ?? "",
            movementDate: item.movement_date,
          })),
        );

        setCloudError("");
        setIsCloudReady(true);
      } catch (error) {
        console.error("Supabase initialization error:", error);
        if (!cancelled) {
          setCloudError(
            error instanceof Error
              ? error.message
              : "Gagal menghubungkan Supabase.",
          );
          console.error("CLOUD ERROR DETAIL:", error);
          notify("Gagal menghubungkan ke cloud");
        }
      }
    };

    initializeCloud();
    return () => {
      cancelled = true;
    };
    // Inisialisasi hanya dijalankan sekali saat aplikasi dimuat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCloudReady || !userId) return;

    const loadRecurringTransactions = async () => {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("next_due_date", { ascending: true });

      if (error) {
        console.error("Load recurring transactions error:", error);
        notify("Gagal memuat jadwal transaksi");
        return;
      }

      setRecurringTransactions(
        (data ?? []).map((item) => ({
          id: item.id,
          accountId: item.account_id,
          title: item.title,
          category: item.category,
          amount: Number(item.amount),
          type: item.type,
          frequency: item.frequency,
          intervalValue: item.interval_value,
          startDate: item.start_date,
          nextDueDate: item.next_due_date,
          notes: item.notes ?? "",
          isActive: item.is_active,
        })),
      );
    };

    void loadRecurringTransactions();
  }, [isCloudReady, userId]);

  useEffect(() => {
    if (!isCloudReady || !userId) return;

    const loadBillReminders = async () => {
      const { data, error } = await supabase
        .from("bill_reminders")
        .select("*")
        .eq("user_id", userId)
        .order("next_due_date", { ascending: true });

      if (error) {
        console.error("Load bill reminders error:", error);
        notify("Gagal memuat pengingat tagihan");
        return;
      }

      setBillReminders(
        (data ?? []).map((item) => ({
          id: item.id,
          accountId: item.account_id,
          title: item.title,
          category: item.category,
          amount: Number(item.amount),
          frequency: item.frequency,
          intervalValue: item.interval_value,
          nextDueDate: item.next_due_date,
          reminderDaysBefore: item.reminder_days_before,
          notes: item.notes ?? "",
          lastPaidAt: item.last_paid_at ?? null,
          isActive: item.is_active,
        })),
      );
    };

    void loadBillReminders();
  }, [isCloudReady, userId]);

  useEffect(() => {
    if (isCloudReady) {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
    }
  }, [accounts, isCloudReady]);

  useEffect(() => {
    if (isCloudReady) {
      localStorage.setItem(TRANSACTION_KEY, JSON.stringify(transactions));
    }
  }, [transactions, isCloudReady]);

  const selectedAccount =
    accounts.find((item) => item.id === selectedId) ?? null;

  const budgetMonthKey = budgetMonth.slice(0, 7);

  const monthlyBudgets = budgets.filter(
    (budget) => budget.budgetMonth.slice(0, 7) === budgetMonthKey,
  );

  const budgetOverview = monthlyBudgets.map((budget) => {
    const category = categories.find((item) => item.id === budget.categoryId);

    const account = accounts.find((item) => item.id === budget.accountId);

    const spent = transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          transaction.accountId === budget.accountId &&
          transaction.categoryId === budget.categoryId &&
          transaction.date.slice(0, 7) === budgetMonthKey,
      )
      .reduce((total, transaction) => total + transaction.amount, 0);

    return {
      ...budget,
      categoryName: category?.name ?? "Kategori tidak ditemukan",
      accountName: account
        ? `${account.bank} · ${account.nickname}`
        : "Rekening tidak ditemukan",
      spent,
      remaining: budget.amount - spent,
      percentage: (spent / budget.amount) * 100,
      status:
        spent >= budget.amount
          ? "over"
          : spent >= budget.amount * 0.8
            ? "near"
            : "safe",
    };
  });

  useEffect(() => {
    if (!isCloudReady || !userId) return;

    const loadTransfers = async () => {
      const { data, error } = await supabase
        .from("account_transfers")
        .select("*")
        .eq("user_id", userId)
        .order("transfer_date", { ascending: false });

      if (error) {
        console.error("Load transfers error:", error);
        notify("Gagal memuat riwayat transfer");
        return;
      }

      setTransfers(
        (data ?? []).map((item) => ({
          id: item.id,
          fromAccountId: item.from_account_id,
          toAccountId: item.to_account_id,
          amount: Number(item.amount),
          description: item.description ?? "",
          transferDate: item.transfer_date,
        })),
      );
    };

    loadTransfers();
  }, [isCloudReady, userId]);

  const selectedBudget = budgetOverview.find(
    (budget) => budget.id === selectedBudgetId,
  );

  const totalMonthlyBudget = monthlyBudgets.reduce(
    (total, budget) => total + budget.amount,
    0,
  );

  const totalBudgetSpent = budgetOverview.reduce(
    (total, budget) => total + budget.spent,
    0,
  );

  const budgetCategoryAnalytics = Array.from(
    budgetOverview
      .reduce(
        (map, budget) => {
          const existing = map.get(budget.categoryId);

          if (existing) {
            existing.spent += budget.spent;
            existing.amount += budget.amount;
          } else {
            map.set(budget.categoryId, {
              categoryId: budget.categoryId,
              categoryName: budget.categoryName,
              spent: budget.spent,
              amount: budget.amount,
            });
          }

          return map;
        },
        new Map<
          string,
          {
            categoryId: string;
            categoryName: string;
            spent: number;
            amount: number;
          }
        >(),
      )
      .values(),
  ).sort((a, b) => b.spent - a.spent);

  const topSpendingCategory = budgetCategoryAnalytics[0] ?? null;

  const totalBudgetPercentage =
    totalMonthlyBudget > 0 ? (totalBudgetSpent / totalMonthlyBudget) * 100 : 0;

  const overallBudgetStatus =
    totalMonthlyBudget === 0
      ? "safe"
      : totalBudgetPercentage >= 100
        ? "over"
        : totalBudgetPercentage >= 80
          ? "near"
          : "safe";

  const overallBudgetStatusLabel =
    overallBudgetStatus === "over"
      ? "Exceeded"
      : overallBudgetStatus === "near"
        ? "Near Limit"
        : "Safe";

  const accountBalances = useMemo(() => {
    return accounts.reduce<Record<string, number>>((result, account) => {
      const transactionNet = transactions
        .filter((item) => item.accountId === account.id)
        .reduce(
          (total, item) =>
            total + (item.type === "income" ? item.amount : -item.amount),
          0,
        );

      const transferNet = transfers.reduce((total, transfer) => {
        if (transfer.fromAccountId === account.id) {
          return total - transfer.amount;
        }

        if (transfer.toAccountId === account.id) {
          return total + transfer.amount;
        }

        return total;
      }, 0);

      result[account.id] =
        account.openingBalance + transactionNet + transferNet;

      return result;
    }, {});
  }, [accounts, transactions, transfers]);

  const getAccountBalance = (accountId: string) =>
    accountBalances[accountId] ?? 0;

  const selectedTransactions = useMemo(
    () =>
      transactions
        .filter((item) => item.accountId === selectedId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, selectedId],
  );

  const filteredTransfers = useMemo(() => {
    const keyword = activitySearch.trim().toLowerCase();

    return transfers
      .filter((item) => {
        const matchesAccount =
          transferAccountFilter === "all" ||
          item.fromAccountId === transferAccountFilter ||
          item.toAccountId === transferAccountFilter;

        const fromAccount = accounts.find(
          (account) => account.id === item.fromAccountId,
        );
        const toAccount = accounts.find(
          (account) => account.id === item.toAccountId,
        );

        const matchesSearch =
          !keyword ||
          item.description.toLowerCase().includes(keyword) ||
          (fromAccount?.nickname ?? "").toLowerCase().includes(keyword) ||
          (toAccount?.nickname ?? "").toLowerCase().includes(keyword);

        return matchesAccount && matchesSearch;
      })
      .sort((a, b) => b.transferDate.localeCompare(a.transferDate));
  }, [transfers, transferAccountFilter, activitySearch, accounts]);

  const selectedBank =
    accountOptions.find((item) => item.name === bank) ?? accountOptions[0];

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const openAddRecurring = () => {
    setEditingRecurringId(null);
    setRecurringTitle("");
    setRecurringAccountId(selectedId || accounts[0]?.id || "");
    setRecurringCategory("");
    setRecurringAmount("");
    setRecurringType("expense");
    setRecurringFrequency("monthly");
    setRecurringInterval("1");
    setRecurringStartDate(toLocalDateOnly(new Date()));
    setRecurringNotes("");
    setShowRecurringModal(true);
  };

  const openEditRecurring = (item: RecurringTransaction) => {
    setEditingRecurringId(item.id);
    setRecurringTitle(item.title);
    setRecurringAccountId(item.accountId);
    setRecurringCategory(item.category);
    setRecurringAmount(String(item.amount));
    setRecurringType(item.type);
    setRecurringFrequency(item.frequency);
    setRecurringInterval(String(item.intervalValue));
    setRecurringStartDate(item.startDate);
    setRecurringNotes(item.notes);
    setShowRecurringModal(true);
  };

  const closeRecurringModal = () => {
    if (isSavingRecurring) return;
    setShowRecurringModal(false);
    setEditingRecurringId(null);
  };

  const openAddBill = () => {
    setEditingBillId(null);
    setBillTitle("");
    setBillAccountId(selectedId || accounts[0]?.id || "");
    setBillCategory(
      categories.find(
        (category) =>
          category.type === "expense" && category.name === "Bills & Utilities",
      )?.name ??
        categories.find((category) => category.type === "expense")?.name ??
        "",
    );
    setBillAmount("");
    setBillFrequency("monthly");
    setBillInterval("1");
    setBillDueDate(toLocalDateOnly(new Date()));
    setBillReminderDays("3");
    setBillNotes("");
    setShowBillModal(true);
  };

  const openEditBill = (item: BillReminder) => {
    setEditingBillId(item.id);
    setBillTitle(item.title);
    setBillAccountId(item.accountId);
    setBillCategory(item.category);
    setBillAmount(String(item.amount));
    setBillFrequency(item.frequency);
    setBillInterval(String(item.intervalValue));
    setBillDueDate(item.nextDueDate);
    setBillReminderDays(String(item.reminderDaysBefore));
    setBillNotes(item.notes);
    setShowBillModal(true);
  };

  const closeBillModal = () => {
    if (isSavingBill) return;
    setShowBillModal(false);
    setEditingBillId(null);
  };

  const saveBillReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId || !isCloudReady) {
      notify("Koneksi cloud belum siap");
      return;
    }

    const amount = Number(billAmount);
    const interval = Number(billInterval);
    const reminderDays = Number(billReminderDays);

    if (
      !billTitle.trim() ||
      !billAccountId ||
      !billCategory ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(interval) ||
      interval <= 0 ||
      !billDueDate ||
      !Number.isInteger(reminderDays) ||
      reminderDays < 0 ||
      reminderDays > 30
    ) {
      notify("Periksa kembali data tagihan");
      return;
    }

    setIsSavingBill(true);

    try {
      const payload = {
        user_id: userId,
        account_id: billAccountId,
        title: billTitle.trim(),
        category: billCategory,
        amount,
        frequency: billFrequency,
        interval_value: interval,
        next_due_date: billDueDate,
        reminder_days_before: reminderDays,
        notes: billNotes.trim(),
      };

      let savedData;
      let error;

      if (editingBillId) {
        const result = await supabase
          .from("bill_reminders")
          .update(payload)
          .eq("id", editingBillId)
          .eq("user_id", userId)
          .select()
          .single();

        savedData = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from("bill_reminders")
          .insert(payload)
          .select()
          .single();

        savedData = result.data;
        error = result.error;
      }

      if (error) throw error;

      const savedItem: BillReminder = {
        id: savedData.id,
        accountId: savedData.account_id,
        title: savedData.title,
        category: savedData.category,
        amount: Number(savedData.amount),
        frequency: savedData.frequency,
        intervalValue: savedData.interval_value,
        nextDueDate: savedData.next_due_date,
        reminderDaysBefore: savedData.reminder_days_before,
        notes: savedData.notes ?? "",
        lastPaidAt: savedData.last_paid_at ?? null,
        isActive: savedData.is_active,
      };

      setBillReminders((current) => {
        const updated = editingBillId
          ? current.map((item) =>
              item.id === editingBillId ? savedItem : item,
            )
          : [...current, savedItem];

        return updated.sort((a, b) =>
          a.nextDueDate.localeCompare(b.nextDueDate),
        );
      });

      setShowBillModal(false);
      setEditingBillId(null);

      notify(
        editingBillId
          ? "Pengingat tagihan berhasil diperbarui"
          : "Pengingat tagihan berhasil ditambahkan",
      );
    } catch (error) {
      console.error("Save bill reminder error:", error);
      notify("Gagal menyimpan pengingat tagihan");
    } finally {
      setIsSavingBill(false);
    }
  };

  const confirmBillPayment = async (item: BillReminder) => {
    if (!userId || !isCloudReady) {
      notify("Koneksi cloud belum siap");
      return;
    }

    if (item.nextDueDate > toLocalDateOnly(new Date())) {
      notify("Tagihan belum jatuh tempo");
      return;
    }

    setIsConfirmingBill(item.id);

    try {
      const { data, error } = await supabase.rpc("confirm_bill_payment", {
        p_bill_id: item.id,
      });

      if (error) throw error;

      const transaction = data.transaction;

      const matchedCategory = categories.find(
        (category) =>
          category.name === transaction.category && category.type === "expense",
      );

      const newTransaction: Transaction = {
        id: transaction.id,
        accountId: transaction.account_id,
        categoryId: transaction.category_id ?? matchedCategory?.id ?? null,
        title: transaction.description,
        category: transaction.category,
        amount: Number(transaction.amount),
        type: "expense",
        date: transaction.transaction_date,
      };

      setTransactions((current) => [newTransaction, ...current]);

      setBillReminders((current) =>
        current.map((bill) =>
          bill.id === item.id
            ? {
                ...bill,
                nextDueDate: data.next_due_date ?? bill.nextDueDate,
                lastPaidAt: new Date().toISOString(),
                isActive: data.is_active,
              }
            : bill,
        ),
      );

      notify("Pembayaran berhasil dicatat");
    } catch (error) {
      console.error("Confirm bill payment error:", error);
      notify("Gagal mencatat pembayaran");
    } finally {
      setIsConfirmingBill(null);
    }
  };

  const deleteBillReminder = async (item: BillReminder) => {
    if (!userId || !isCloudReady) {
      notify("Koneksi cloud belum siap");
      return;
    }

    setIsDeletingBill(item.id);

    try {
      const { error } = await supabase
        .from("bill_reminders")
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId);

      if (error) throw error;

      setBillReminders((current) =>
        current.filter((bill) => bill.id !== item.id),
      );

      notify("Pengingat tagihan berhasil dihapus");
    } catch (error) {
      console.error("Delete bill reminder error:", error);
      notify("Gagal menghapus pengingat tagihan");
    } finally {
      setIsDeletingBill(null);
    }
  };

  const saveRecurringTransaction = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!userId || !isCloudReady) {
      notify("Koneksi cloud belum siap");
      return;
    }

    const amount = Number(recurringAmount);
    const interval = Number(recurringInterval);

    if (
      !recurringTitle.trim() ||
      !recurringAccountId ||
      !recurringCategory ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(interval) ||
      interval <= 0 ||
      !recurringStartDate
    ) {
      notify("Periksa kembali data jadwal");
      return;
    }

    setIsSavingRecurring(true);

    try {
      const existing = recurringTransactions.find(
        (item) => item.id === editingRecurringId,
      );

      const payload = {
        user_id: userId,
        account_id: recurringAccountId,
        title: recurringTitle.trim(),
        category: recurringCategory,
        amount,
        type: recurringType,
        frequency: recurringFrequency,
        interval_value: interval,
        start_date: recurringStartDate,
        next_due_date: existing?.nextDueDate ?? recurringStartDate,
        notes: recurringNotes.trim(),
      };

      let savedData;
      let error;

      if (editingRecurringId) {
        const result = await supabase
          .from("recurring_transactions")
          .update(payload)
          .eq("id", editingRecurringId)
          .eq("user_id", userId)
          .select()
          .single();

        savedData = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from("recurring_transactions")
          .insert(payload)
          .select()
          .single();

        savedData = result.data;
        error = result.error;
      }

      if (error) throw error;

      const savedItem: RecurringTransaction = {
        id: savedData.id,
        accountId: savedData.account_id,
        title: savedData.title,
        category: savedData.category,
        amount: Number(savedData.amount),
        type: savedData.type,
        frequency: savedData.frequency,
        intervalValue: savedData.interval_value,
        startDate: savedData.start_date,
        nextDueDate: savedData.next_due_date,
        notes: savedData.notes ?? "",
        isActive: savedData.is_active,
      };

      setRecurringTransactions((current) => {
        const updated = editingRecurringId
          ? current.map((item) =>
              item.id === editingRecurringId ? savedItem : item,
            )
          : [...current, savedItem];

        return updated.sort((a, b) =>
          a.nextDueDate.localeCompare(b.nextDueDate),
        );
      });

      setShowRecurringModal(false);
      setEditingRecurringId(null);
      notify(
        editingRecurringId
          ? "Jadwal berhasil diperbarui"
          : "Jadwal berhasil ditambahkan",
      );
    } catch (error) {
      console.error("Save recurring transaction error:", error);
      notify("Gagal menyimpan jadwal transaksi");
    } finally {
      setIsSavingRecurring(false);
    }
  };

  const toggleRecurringStatus = async (item: RecurringTransaction) => {
    if (!userId) return;

    const nextStatus = !item.isActive;

    const { error } = await supabase
      .from("recurring_transactions")
      .update({
        is_active: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Update recurring status error:", error);
      notify("Gagal mengubah status jadwal");
      return;
    }

    setRecurringTransactions((current) =>
      current.map((schedule) =>
        schedule.id === item.id
          ? { ...schedule, isActive: nextStatus }
          : schedule,
      ),
    );

    notify(nextStatus ? "Jadwal diaktifkan" : "Jadwal dijeda");
  };

  const deleteRecurringTransaction = async (item: RecurringTransaction) => {
    if (!userId) return;

    const { error } = await supabase
      .from("recurring_transactions")
      .delete()
      .eq("id", item.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Delete recurring transaction error:", error);
      notify("Gagal menghapus jadwal");
      return;
    }

    setRecurringTransactions((current) =>
      current.filter((schedule) => schedule.id !== item.id),
    );

    notify("Jadwal berhasil dihapus");
  };

  const confirmRecurringTransaction = async (item: RecurringTransaction) => {
    if (!userId || !isCloudReady) {
      notify("Koneksi cloud belum siap");
      return;
    }

    const today = toLocalDateOnly(new Date());

    if (item.nextDueDate > today) {
      notify("Jadwal ini belum jatuh tempo");
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        "confirm_recurring_transaction",
        { p_recurring_id: item.id },
      );

      if (error) throw error;

      const transaction = data.transaction;
      const category = categories.find(
        (entry) =>
          entry.name === transaction.category &&
          entry.type === transaction.type,
      );

      const newTransaction: Transaction = {
        id: transaction.id,
        accountId: transaction.account_id,
        categoryId: transaction.category_id ?? category?.id ?? null,
        title: transaction.description,
        category: transaction.category,
        amount: Number(transaction.amount),
        type: transaction.type,
        date: transaction.transaction_date,
      };

      setTransactions((current) => [newTransaction, ...current]);

      setRecurringTransactions((current) =>
        current.map((schedule) =>
          schedule.id === item.id
            ? {
                ...schedule,
                nextDueDate: data.next_due_date,
              }
            : schedule,
        ),
      );

      notify("Transaksi berhasil dikonfirmasi");
    } catch (error) {
      console.error("Confirm recurring transaction error:", error);

      const message = error instanceof Error ? error.message : String(error);

      notify(`Gagal: ${message}`);
    }
  };

  const openAddGoal = () => {
    setEditingGoalId(null);
    setGoalName("");
    setGoalTargetAmount("");
    setGoalTargetDate("");
    setShowGoalModal(true);
  };

  const openEditGoal = (goal: SavingsGoal) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalTargetAmount(String(goal.targetAmount));
    setGoalTargetDate(goal.targetDate ?? "");
    setShowGoalModal(true);
  };

  const deleteSavingsGoal = async () => {
    if (!goalToDelete || !userId || !isCloudReady) {
      notify("Koneksi cloud belum siap");
      return;
    }

    setIsDeletingGoal(true);

    try {
      const { error } = await supabase
        .from("savings_goals")
        .delete()
        .eq("id", goalToDelete.id)
        .eq("user_id", userId);

      if (error) throw error;

      const deletedGoalId = goalToDelete.id;

      setSavingsGoals((current) =>
        current.filter((goal) => goal.id !== deletedGoalId),
      );

      setGoalContributions((current) =>
        current.filter((item) => item.goalId !== deletedGoalId),
      );

      setGoalToDelete(null);
      setSelectedSavingsGoalId(null);
      setActiveTab("Savings");

      notify("Savings goal berhasil dihapus");
    } catch (error) {
      console.error("Delete savings goal error:", error);
      notify("Gagal menghapus savings goal");
    } finally {
      setIsDeletingGoal(false);
    }
  };

  const closeSavingsPocketModal = () => {
    if (isSavingSavingsPocket) return;

    setShowSavingsPocketModal(false);
    setSavingsPocketName("");
    setSavingsPocketDescription("");
  };

  const createSavingsPocket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = savingsPocketName.trim();
    const description = savingsPocketDescription.trim();

    if (!name) {
      notify("Nama savings pocket wajib diisi");
      return;
    }

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    setIsSavingSavingsPocket(true);

    try {
      const { data, error } = await supabase
        .from("savings_pockets")
        .insert({
          user_id: userId,
          name,
          description,
        })
        .select("*")
        .single();

      if (error) throw error;

      const newPocket: SavingsPocket = {
        id: data.id,
        name: data.name,
        description: data.description ?? "",
        createdAt: data.created_at,
      };

      setSavingsPockets((current) => [...current, newPocket]);

      setShowSavingsPocketModal(false);
      setSavingsPocketName("");
      setSavingsPocketDescription("");

      notify("Savings pocket berhasil dibuat");
    } catch (error) {
      console.error("Create savings pocket error:", error);
      notify("Savings pocket gagal dibuat");
    } finally {
      setIsSavingSavingsPocket(false);
    }
  };

  const closeSavingsMovementModal = () => {
    if (isSavingSavingsMovement) return;

    setShowSavingsMovementModal(false);
    setSavingsMovementAmount("");
    setSavingsMovementNote("");
    setSavingsMovementDate(new Date().toISOString().slice(0, 10));
  };

  const createSavingsMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSavingsPocket || !userId || !isCloudReady) {
      notify("Savings pocket atau koneksi cloud tidak tersedia");
      return;
    }

    const amount = Number(savingsMovementAmount);
    const currentBalance = getSavingsPocketBalance(selectedSavingsPocket.id);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Nominal harus lebih dari 0");
      return;
    }

    if (savingsMovementType === "withdrawal" && amount > currentBalance) {
      notify("Saldo savings pocket tidak mencukupi");
      return;
    }

    if (!savingsMovementDate) {
      notify("Tanggal transaksi wajib diisi");
      return;
    }

    setIsSavingSavingsMovement(true);

    try {
      const { data, error } = await supabase
        .from("savings_movements")
        .insert({
          user_id: userId,
          pocket_id: selectedSavingsPocket.id,
          type: savingsMovementType,
          amount,
          note: savingsMovementNote.trim(),
          movement_date: savingsMovementDate,
        })
        .select("*")
        .single();

      if (error) throw error;

      const newMovement: SavingsMovement = {
        id: data.id,
        pocketId: data.pocket_id,
        type: data.type,
        amount: Number(data.amount),
        note: data.note ?? "",
        movementDate: data.movement_date,
      };

      setSavingsMovements((current) => [newMovement, ...current]);

      setShowSavingsMovementModal(false);
      setSavingsMovementAmount("");
      setSavingsMovementNote("");
      setSavingsMovementDate(new Date().toISOString().slice(0, 10));

      notify(
        savingsMovementType === "deposit"
          ? "Deposit berhasil disimpan"
          : "Withdrawal berhasil disimpan",
      );
    } catch (error) {
      console.error("Create savings movement error:", error);
      notify("Transaksi gagal disimpan");
    } finally {
      setIsSavingSavingsMovement(false);
    }
  };

  const closeGoalModal = () => {
    setShowGoalModal(false);
    setEditingGoalId(null);
    setGoalName("");
    setGoalTargetAmount("");
    setGoalTargetDate("");
  };

  const openSavingsGoalDetail = (goalId: string) => {
    setSelectedSavingsGoalId(goalId);
    setActiveTab("SavingsDetail");
  };

  const openContributionModal = (goalId: string) => {
    setSelectedGoalId(goalId);
    setContributionAmount("");
    setContributionNote("");
    setShowContributionModal(true);
  };

  const closeContributionModal = () => {
    if (isSavingContribution) return;

    setShowContributionModal(false);
    setSelectedGoalId("");
    setContributionAmount("");
    setContributionNote("");
  };

  const openEditContribution = (contribution: GoalContribution) => {
    setEditingContribution(contribution);
    setEditContributionAmount(String(contribution.amount));
    setEditContributionNote(contribution.note || "");
  };

  const closeEditContribution = () => {
    if (isUpdatingContribution) return;

    setEditingContribution(null);
    setEditContributionAmount("");
    setEditContributionNote("");
  };

  const saveEditedContribution = async () => {
    if (!editingContribution || isUpdatingContribution) return;

    const amount = Number(editContributionAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Nominal setoran harus lebih dari 0.");
      return;
    }

    setIsUpdatingContribution(true);

    try {
      const { error } = await supabase.rpc("edit_goal_contribution", {
        p_contribution_id: editingContribution.id,
        p_amount: amount,
        p_note: editContributionNote.trim(),
      });

      if (error) throw error;

      const difference = amount - editingContribution.amount;

      setGoalContributions((previous) =>
        previous.map((item) =>
          item.id === editingContribution.id
            ? {
                ...item,
                amount,
                note: editContributionNote.trim(),
              }
            : item,
        ),
      );

      setSavingsGoals((previous) =>
        previous.map((goal) =>
          goal.id === editingContribution.goalId
            ? {
                ...goal,
                currentAmount: goal.currentAmount + difference,
              }
            : goal,
        ),
      );

      setEditingContribution(null);
      setEditContributionAmount("");
      setEditContributionNote("");
    } catch (error) {
      console.error("Gagal mengedit contribution:", error);
      alert("Gagal mengedit setoran. Silakan coba lagi.");
    } finally {
      setIsUpdatingContribution(false);
    }
  };

  const deleteContribution = async () => {
    if (!contributionToDelete || isDeletingContribution) return;

    setIsDeletingContribution(true);

    try {
      const { error } = await supabase.rpc("delete_goal_contribution", {
        p_contribution_id: contributionToDelete.id,
      });

      if (error) throw error;

      setGoalContributions((previous) =>
        previous.filter((item) => item.id !== contributionToDelete.id),
      );

      setSavingsGoals((previous) =>
        previous.map((goal) =>
          goal.id === contributionToDelete.goalId
            ? {
                ...goal,
                currentAmount: goal.currentAmount - contributionToDelete.amount,
              }
            : goal,
        ),
      );

      setContributionToDelete(null);
    } catch (error) {
      console.error("Gagal menghapus contribution:", error);
      alert("Gagal menghapus setoran. Silakan coba lagi.");
    } finally {
      setIsDeletingContribution(false);
    }
  };

  const saveContribution = async () => {
    if (!isCloudReady || !userId) {
      notify("Cloud belum siap");
      return;
    }

    const amount = Number(contributionAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Masukkan nominal setoran yang valid");
      return;
    }

    if (!selectedGoalId) {
      notify("Savings goal tidak ditemukan");
      return;
    }

    setIsSavingContribution(true);

    try {
      const { error } = await supabase.rpc("add_goal_contribution", {
        p_goal_id: selectedGoalId,
        p_amount: amount,
        p_note: contributionNote.trim(),
      });

      if (error) throw error;

      const { data: updatedGoal, error: goalError } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("id", selectedGoalId)
        .single();

      if (goalError) throw goalError;

      const { data: updatedContributions, error: contributionError } =
        await supabase
          .from("goal_contributions")
          .select("*")
          .eq("user_id", userId)
          .order("contributed_at", { ascending: false });

      if (contributionError) throw contributionError;

      setSavingsGoals((prev) =>
        prev.map((goal) =>
          goal.id === selectedGoalId
            ? {
                ...goal,
                currentAmount: Number(updatedGoal.current_amount),
              }
            : goal,
        ),
      );

      setGoalContributions(
        (updatedContributions || []).map((item) => ({
          id: item.id,
          goalId: item.goal_id,
          amount: Number(item.amount),
          note: item.note || "",
          contributedAt: item.contributed_at,
        })),
      );

      setShowContributionModal(false);
      setSelectedGoalId("");
      setContributionAmount("");
      setContributionNote("");

      notify("Setoran berhasil ditambahkan");
    } catch (error) {
      console.error("Save contribution error:", error);
      notify("Gagal menyimpan setoran");
    } finally {
      setIsSavingContribution(false);
    }
  };

  const openBudgetDetail = (budgetId: string) => {
    setSelectedBudgetId(budgetId);
    setActiveTab("BudgetDetail");
  };

  const closeBudgetModal = () => {
    setShowBudgetModal(false);
    setEditingBudgetId(null);
    setBudgetAccountId("");
    setBudgetCategoryId("");
    setBudgetAmount("");
  };

  const saveBudget = async () => {
    if (!userId) {
      notify("Sesi pengguna belum siap");
      return;
    }

    if (!budgetAccountId || !budgetCategoryId || !budgetAmount) {
      notify("Lengkapi semua data budget");
      return;
    }

    const amount = Number(budgetAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Nominal budget harus lebih dari 0");
      return;
    }

    const budgetData = {
      user_id: userId,
      account_id: budgetAccountId,
      category_id: budgetCategoryId,
      budget_month: budgetMonth,
      amount,
    };

    try {
      let result;

      if (editingBudgetId) {
        result = await supabase
          .from("budgets")
          .update(budgetData)
          .eq("id", editingBudgetId)
          .eq("user_id", userId)
          .select()
          .single();
      } else {
        result = await supabase
          .from("budgets")
          .insert(budgetData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      const savedBudget: Budget = {
        id: result.data.id,
        accountId: result.data.account_id,
        categoryId: result.data.category_id,
        budgetMonth: result.data.budget_month,
        amount: Number(result.data.amount),
        createdAt: result.data.created_at,
      };

      setBudgets((previous) =>
        editingBudgetId
          ? previous.map((item) =>
              item.id === editingBudgetId ? savedBudget : item,
            )
          : [...previous, savedBudget],
      );

      closeBudgetModal();
      notify(
        editingBudgetId
          ? "Budget berhasil diperbarui"
          : "Budget berhasil ditambahkan",
      );
    } catch (error: any) {
      console.error("Save budget error:", error);

      if (error.code === "23505") {
        notify("Budget untuk rekening, kategori, dan bulan ini sudah ada.");
      } else {
        notify("Gagal menyimpan budget. Periksa data atau koneksi.");
      }
    }
  };

  const deleteBudget = async () => {
    if (!budgetToDelete || isDeletingBudget) return;

    if (!userId) {
      notify("Sesi pengguna belum siap");
      return;
    }

    setIsDeletingBudget(true);

    try {
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", budgetToDelete.id)
        .eq("user_id", userId);

      if (error) throw error;

      setBudgets((previous) =>
        previous.filter((item) => item.id !== budgetToDelete.id),
      );

      setBudgetToDelete(null);
      notify("Budget berhasil dihapus");
    } catch (error) {
      console.error("Delete budget error:", error);
      notify("Gagal menghapus budget");
    } finally {
      setIsDeletingBudget(false);
    }
  };

  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = goalName.trim();
    const targetAmount = Number(goalTargetAmount);

    if (!name) {
      notify("Nama target wajib diisi");
      return;
    }

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      notify("Nominal target tidak valid");
      return;
    }

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    if (
      savingsGoals.some(
        (goal) =>
          goal.id !== editingGoalId &&
          goal.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      notify("Nama target tersebut sudah digunakan");
      return;
    }

    const goalData = {
      name,
      target_amount: targetAmount,
      target_date: goalTargetDate || null,
    };

    try {
      if (editingGoalId) {
        const { data, error } = await supabase
          .from("savings_goals")
          .update(goalData)
          .eq("id", editingGoalId)
          .eq("user_id", userId)
          .select("*")
          .single();

        if (error) throw error;

        setSavingsGoals((current) =>
          current.map((goal) =>
            goal.id === editingGoalId
              ? {
                  ...goal,
                  name: data.name,
                  targetAmount: Number(data.target_amount),
                  targetDate: data.target_date ?? null,
                }
              : goal,
          ),
        );

        closeGoalModal();
        notify("Savings goal berhasil diperbarui");
      } else {
        const { data, error } = await supabase
          .from("savings_goals")
          .insert({
            ...goalData,
            user_id: userId,
            current_amount: 0,
          })
          .select("*")
          .single();

        if (error) throw error;

        setSavingsGoals((current) => [
          ...current,
          {
            id: data.id,
            name: data.name,
            targetAmount: Number(data.target_amount),
            currentAmount: Number(data.current_amount),
            targetDate: data.target_date ?? null,
            createdAt: data.created_at,
          },
        ]);

        closeGoalModal();
        notify("Target tabungan berhasil dibuat");
      }
    } catch (error) {
      console.error("Save goal error:", error);
      notify(
        editingGoalId
          ? "Savings goal gagal diperbarui"
          : "Target tabungan gagal disimpan",
      );
    }
  };

  const openAddAccount = () => {
    setEditingAccountId(null);
    setAccountKind("Bank");
    setBank("BCA");
    setNickname("");
    setNumber("");
    setBalance("");
    setShowAccountModal(true);
  };

  const closeAccountModal = () => {
    setShowAccountModal(false);
    setEditingAccountId(null);
    setAccountKind("Bank");
    setBank("BCA");
    setNickname("");
    setNumber("");
    setBalance("");
  };

  const openEditAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setAccountKind(account.kind);
    setBank(account.bank);
    setNickname(account.nickname);
    setNumber(account.number);
    setBalance(String(account.openingBalance));
    setShowAccountModal(true);
  };

  const addAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const option = accountOptions.find((item) => item.name === bank);

    if (!option || option.kind !== accountKind) {
      notify("Pilih bank atau e-wallet yang valid");
      return;
    }

    const openingBalance = Number(balance);

    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      notify("Saldo awal tidak valid");
      return;
    }

    if (openingBalance >= 10_000_000_000_000) {
      notify("Saldo maksimal adalah Rp9.999.999.999.999");
      return;
    }

    const accountData = {
      bank,
      nickname: nickname.trim() || bank,
      account_number: number.trim(),
      opening_balance: openingBalance,
      kind: accountKind,
    };

    // MODE EDIT REKENING
    if (editingAccountId) {
      const { data, error } = await supabase
        .from("accounts")
        .update(accountData)
        .eq("id", editingAccountId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("Update account error:", error);
        notify("Rekening gagal diperbarui");
        return;
      }

      if (!data) {
        notify("Rekening tidak ditemukan atau akses ditolak");
        return;
      }

      setAccounts((current) =>
        current.map((account) =>
          account.id === editingAccountId
            ? {
                ...account,
                bank: accountData.bank,
                nickname: accountData.nickname,
                number: accountData.account_number,
                openingBalance: accountData.opening_balance,
                kind: accountData.kind,
              }
            : account,
        ),
      );

      closeAccountModal();
      notify("Rekening berhasil diperbarui");
      return;
    }

    // MODE TAMBAH REKENING
    const newAccount: Account = {
      id: crypto.randomUUID(),
      bank: accountData.bank,
      nickname: accountData.nickname,
      number: accountData.account_number,
      openingBalance: accountData.opening_balance,
      kind: accountData.kind,
    };

    const { error } = await supabase.from("accounts").insert({
      id: newAccount.id,
      user_id: userId,
      ...accountData,
    });

    if (error) {
      console.error("Add account error:", error);
      notify("Rekening gagal disimpan ke cloud");
      return;
    }

    setAccounts((current) => [...current, newAccount]);
    setSelectedId(newAccount.id);

    closeAccountModal();
    notify("Rekening berhasil ditambahkan");
  };

  // BUKA MODAL TAMBAH KATEGORI
  const openAddCategory = () => {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryType("expense");
    setShowCategoryModal(true);
  };

  // BUKA MODAL EDIT KATEGORI
  const openEditCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryType(category.type);
    setShowCategoryModal(true);
  };

  // TUTUP MODAL KATEGORI
  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryType("expense");
  };

  // SIMPAN KATEGORI
  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = categoryName.trim();

    if (!name) {
      notify("Nama kategori wajib diisi");
      return;
    }

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== editingCategoryId &&
        category.name.toLowerCase() === name.toLowerCase() &&
        category.type === categoryType,
    );

    if (duplicate) {
      notify("Kategori tersebut sudah tersedia");
      return;
    }

    const categoryData = {
      name,
      type: categoryType,
      icon: null,
    };

    // MODE EDIT
    if (editingCategoryId) {
      const currentCategory = categories.find(
        (category) => category.id === editingCategoryId,
      );

      if (!currentCategory) {
        notify("Kategori tidak ditemukan");
        return;
      }

      const relatedTransactions = transactions.filter(
        (transaction) =>
          transaction.category === currentCategory.name &&
          transaction.type === currentCategory.type,
      );

      // Cegah perubahan jenis kategori yang sudah digunakan
      if (
        currentCategory.type !== categoryType &&
        relatedTransactions.length > 0
      ) {
        notify(
          "Jenis kategori tidak bisa diubah karena sudah digunakan transaksi",
        );
        return;
      }

      const { data, error } = await supabase
        .from("categories")
        .update(categoryData)
        .eq("id", editingCategoryId)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Update category error:", error);
        notify("Kategori gagal diperbarui");
        return;
      }

      if (!data) {
        notify("Kategori tidak ditemukan atau akses ditolak");
        return;
      }

      // Sinkronisasi nama kategori pada transaksi lama
      if (currentCategory.name !== name) {
        const { error: transactionError } = await supabase
          .from("transactions")
          .update({
            category: name,
            category_id: editingCategoryId,
          })
          .eq("user_id", userId)
          .eq("category", currentCategory.name)
          .eq("type", currentCategory.type);

        if (transactionError) {
          console.error("Transaction category sync error:", transactionError);

          setCategories((current) =>
            current.map((category) =>
              category.id === editingCategoryId
                ? {
                    id: data.id,
                    name: data.name,
                    type: data.type,
                    icon: data.icon ?? null,
                  }
                : category,
            ),
          );

          closeCategoryModal();
          notify(
            "Kategori diperbarui, tetapi sebagian riwayat transaksi belum tersinkron",
          );
          return;
        }

        setTransactions((current) =>
          current.map((transaction) =>
            transaction.category === currentCategory.name &&
            transaction.type === currentCategory.type
              ? { ...transaction, category: name }
              : transaction,
          ),
        );
      }

      setCategories((current) =>
        current.map((category) =>
          category.id === editingCategoryId
            ? {
                id: data.id,
                name: data.name,
                type: data.type,
                icon: data.icon ?? null,
              }
            : category,
        ),
      );

      closeCategoryModal();
      notify("Kategori berhasil diperbarui");
      return;
    }

    // MODE TAMBAH
    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: userId,
        ...categoryData,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Add category error:", error);
      notify(
        error.code === "23505"
          ? "Kategori tersebut sudah tersedia"
          : "Kategori gagal disimpan",
      );
      return;
    }

    setCategories((current) => [
      ...current,
      {
        id: data.id,
        name: data.name,
        type: data.type,
        icon: data.icon ?? null,
      },
    ]);

    closeCategoryModal();
    notify("Kategori berhasil ditambahkan");
  };

  // HAPUS KATEGORI
  const deleteCategory = async () => {
    if (!categoryToDelete) return;

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    setIsDeletingCategory(true);

    try {
      // Lepaskan relasi kategori dari transaksi terkait.
      // Nama kategori lama tetap disimpan sebagai riwayat.
      const { error: transactionError } = await supabase
        .from("transactions")
        .update({ category_id: null })
        .eq("user_id", userId)
        .eq("category_id", categoryToDelete.id);

      if (transactionError) {
        console.error("Detach category error:", transactionError);
        notify("Gagal memperbarui riwayat transaksi");
        return;
      }

      // Hapus kategori dari tabel categories.
      const { data, error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryToDelete.id)
        .eq("user_id", userId)
        .select("id");

      if (error) {
        console.error("Delete category error:", error);
        notify("Kategori gagal dihapus");
        return;
      }

      if (!data || data.length === 0) {
        notify("Kategori tidak ditemukan atau akses ditolak");
        return;
      }

      // Perbarui data aplikasi.
      setTransactions((current) =>
        current.map((transaction) =>
          transaction.categoryId === categoryToDelete.id
            ? { ...transaction, categoryId: null }
            : transaction,
        ),
      );

      setCategories((current) =>
        current.filter((category) => category.id !== categoryToDelete.id),
      );

      setCategoryToDelete(null);
      notify("Kategori berhasil dihapus");
    } catch (error) {
      console.error("Delete category unexpected error:", error);
      notify("Terjadi kesalahan saat menghapus kategori");
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const openTransferModal = () => {
    if (accounts.length < 2) {
      notify("Minimal harus ada 2 rekening untuk transfer");
      return;
    }

    const sourceId =
      selectedId && accounts.some((item) => item.id === selectedId)
        ? selectedId
        : accounts[0].id;

    const destinationId =
      accounts.find((item) => item.id !== sourceId)?.id ?? "";

    setTransferFromId(sourceId);
    setTransferToId(destinationId);
    setTransferAmount("");
    setTransferDescription("");
    setTransferDate(toLocalDateOnly(new Date()));
    setShowTransferModal(true);
  };

  const closeTransferModal = () => {
    if (isSavingTransfer) return;

    setShowTransferModal(false);
    setTransferAmount("");
    setTransferDescription("");
  };

  const saveTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    if (!transferFromId || !transferToId) {
      notify("Pilih rekening asal dan tujuan");
      return;
    }

    if (transferFromId === transferToId) {
      notify("Rekening asal dan tujuan tidak boleh sama");
      return;
    }

    const amount = Number(transferAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Nominal transfer tidak valid");
      return;
    }

    if (amount > getAccountBalance(transferFromId)) {
      notify("Saldo rekening asal tidak mencukupi");
      return;
    }

    setIsSavingTransfer(true);

    try {
      const payload = {
        user_id: userId,
        from_account_id: transferFromId,
        to_account_id: transferToId,
        amount,
        description: transferDescription.trim(),
        transfer_date: transferDate,
      };

      const { data, error } = await supabase
        .from("account_transfers")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      const newTransfer: AccountTransfer = {
        id: data.id,
        fromAccountId: data.from_account_id,
        toAccountId: data.to_account_id,
        amount: Number(data.amount),
        description: data.description ?? "",
        transferDate: data.transfer_date,
      };

      setTransfers((current) => [newTransfer, ...current]);

      setSelectedId(transferFromId);
      setShowTransferModal(false);

      notify("Transfer berhasil disimpan");
    } catch (error) {
      console.error("Save transfer error:", error);
      notify(
        error instanceof Error
          ? `Transfer gagal: ${error.message}`
          : "Transfer gagal disimpan",
      );
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const addTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAccount) {
      notify("Tambahkan rekening terlebih dahulu");
      return;
    }

    const amount = Number(transactionAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Nominal transaksi tidak valid");
      return;
    }

    if (!transactionTitle.trim()) {
      notify("Deskripsi transaksi wajib diisi");
      return;
    }

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap. Coba lagi sebentar.");
      return;
    }

    const transactionDateTime = `${transactionDate}T12:00:00`;

    const selectedCategory = categories.find(
      (category) =>
        category.name === transactionCategory &&
        category.type === transactionType,
    );

    const payload = {
      category_id: selectedCategory?.id ?? null,
      category: transactionCategory,
      type: transactionType,
      amount,
      description: transactionTitle.trim(),
      transaction_date: transactionDate,
    };

    // MODE EDIT
    if (editingTransactionId) {
      const { data, error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", editingTransactionId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("Update transaction error:", error);
        notify("Transaksi gagal diperbarui");
        return;
      }

      if (!data) {
        notify("Transaksi tidak ditemukan atau akses ditolak");
        return;
      }

      setTransactions((current) =>
        current.map((item) =>
          item.id === editingTransactionId
            ? {
                ...item,
                title: payload.description,
                category: payload.category,
                amount: payload.amount,
                type: payload.type,
                date: transactionDateTime,
              }
            : item,
        ),
      );

      setShowTransactionModal(false);
      setEditingTransactionId(null);
      setTransactionTitle("");
      setTransactionAmount("");
      setTransactionDate(toLocalDateOnly(new Date().toISOString()));

      notify("Transaksi berhasil diperbarui");
      return;
    }

    // MODE TAMBAH
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      accountId: selectedAccount.id,
      categoryId: payload.category_id,
      title: payload.description,
      category: payload.category,
      amount: payload.amount,
      type: payload.type,
      date: transactionDateTime,
    };

    const { error } = await supabase.from("transactions").insert({
      id: transaction.id,
      user_id: userId,
      account_id: transaction.accountId,
      ...payload,
    });

    if (error) {
      console.error("Add transaction error:", error);
      notify("Transaksi gagal disimpan ke cloud");
      return;
    }

    setTransactions((current) => [transaction, ...current]);

    setShowTransactionModal(false);
    setTransactionTitle("");
    setTransactionAmount("");
    setTransactionDate(toLocalDateOnly(new Date().toISOString()));
    setEditingTransactionId(null);

    notify("Transaksi berhasil disimpan");
  };

  const closeTransactionModal = () => {
    setShowTransactionModal(false);
    setEditingTransactionId(null);
    setTransactionTitle("");
    setTransactionAmount("");
    setTransactionDate(toLocalDateOnly(new Date().toISOString()));
  };

  const openTransactionDetail = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };

  const closeTransactionDetail = () => {
    setSelectedTransaction(null);
  };

  const openEditTransaction = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setTransactionTitle(transaction.title);
    setTransactionCategory(transaction.category);
    setTransactionAmount(String(transaction.amount));
    setTransactionType(transaction.type);
    setTransactionDate(toLocalDateOnly(transaction.date));
    setSelectedId(transaction.accountId);
    setSelectedTransaction(null);
    setShowTransactionModal(true);
  };

  const deleteTransaction = async () => {
    if (!transactionToDelete) return;

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    setIsDeletingTransaction(true);

    try {
      const result = await supabase
        .from("transactions")
        .delete()
        .eq("id", transactionToDelete.id)
        .eq("user_id", userId)
        .select("id");

      if (result.error) {
        console.error("[DELETE] ERROR:", result.error);
        notify(`Gagal menghapus: ${result.error.message}`);
        return;
      }

      if (!result.data || result.data.length === 0) {
        notify("Transaksi tidak ditemukan atau akses ditolak");
        return;
      }

      setTransactions((current) =>
        current.filter((item) => item.id !== transactionToDelete.id),
      );

      setTransactionToDelete(null);
      notify("Transaksi berhasil dihapus");
    } catch (error) {
      console.error("[DELETE] Unexpected error:", error);
      notify("Terjadi kesalahan saat menghapus transaksi");
    } finally {
      setIsDeletingTransaction(false);
    }
  };

  const deleteAccount = async () => {
    if (!accountToDelete) return;

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap");
      return;
    }

    setIsDeletingAccount(true);

    try {
      const result = await supabase
        .from("accounts")
        .delete()
        .eq("id", accountToDelete.id)
        .eq("user_id", userId)
        .select("id");

      if (result.error) {
        console.error("[DELETE ACCOUNT] ERROR:", result.error);
        notify(`Gagal menghapus rekening: ${result.error.message}`);
        return;
      }

      if (!result.data || result.data.length === 0) {
        notify("Rekening tidak ditemukan atau akses ditolak");
        return;
      }

      const deletedAccountId = accountToDelete.id;

      setAccounts((current) =>
        current.filter((item) => item.id !== deletedAccountId),
      );

      setTransactions((current) =>
        current.filter((item) => item.accountId !== deletedAccountId),
      );

      if (selectedId === deletedAccountId) {
        const remainingAccounts = accounts.filter(
          (item) => item.id !== deletedAccountId,
        );

        setSelectedId(remainingAccounts[0]?.id ?? null);
      }

      setAccountToDelete(null);
      notify("Rekening berhasil dihapus");
    } catch (error) {
      console.error("[DELETE ACCOUNT] Unexpected error:", error);
      notify("Terjadi kesalahan saat menghapus rekening");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleTab = (tab: string) => {
    if (tab === "Scan") {
      if (!selectedAccount) {
        notify("Tambahkan atau pilih rekening terlebih dahulu");
        return;
      }
      setCameraError("");
      setShowScanCamera(true);
      return;
    }
    setActiveTab(tab);
  };

  const closeScanCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setFlashEnabled(false);
    setFlashAvailable(false);
    setShowScanCamera(false);
  };

  // Kamera belakang perangkat. Torch hanya aktif pada browser/perangkat yang mendukungnya.
  useEffect(() => {
    if (!showScanCamera) return;

    let cancelled = false;
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Browser ini belum mendukung akses kamera.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play();
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setFlashAvailable(Boolean(capabilities?.torch));
      } catch (error) {
        console.error("Camera error:", error);
        if (!cancelled) {
          setCameraError(
            error instanceof Error
              ? error.message
              : "Kamera tidak dapat dibuka. Periksa izin kamera perangkat.",
          );
        }
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [showScanCamera]);

  const toggleCameraFlash = async () => {
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (!track || !flashAvailable) {
      notify("Flash tidak didukung oleh perangkat atau browser ini");
      return;
    }
    const nextValue = !flashEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextValue } as MediaTrackConstraintSet],
      });
      setFlashEnabled(nextValue);
    } catch (error) {
      console.error("Flash error:", error);
      notify("Flash tidak dapat diaktifkan pada perangkat ini");
    }
  };

  const readReceiptImage = async (file: File) => {
    closeScanCamera();
    setIsReadingReceipt(true);
    setOcrProgress(0);
    notify("Sedang meningkatkan kualitas gambar dan membaca struk...");

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      // Siapkan gambar beresolusi lebih tinggi, grayscale, dan kontras yang
      // ditingkatkan agar teks struk tipis lebih mudah dikenali OCR.
      const sourceImage = await createImageBitmap(file);
      const maxWidth = 2400;
      const scale = Math.min(2, maxWidth / sourceImage.width);
      const width = Math.max(1, Math.round(sourceImage.width * scale));
      const height = Math.max(1, Math.round(sourceImage.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Tidak dapat memproses gambar struk");

      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(sourceImage, 0, 0, width, height);
      sourceImage.close();

      const imageData = context.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const gray =
          0.299 * pixels[index] +
          0.587 * pixels[index + 1] +
          0.114 * pixels[index + 2];
        // Kontras lembut, tanpa threshold keras yang dapat menghilangkan
        // karakter tipis pada kertas thermal.
        const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
        pixels[index] = enhanced;
        pixels[index + 1] = enhanced;
        pixels[index + 2] = enhanced;
      }
      context.putImageData(imageData, 0, 0);

      worker = await createWorker("eng+ind", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setOcrProgress(Math.min(95, Math.round(message.progress * 90)));
          } else if (message.status === "loading language traineddata") {
            setOcrProgress(Math.min(20, Math.round(message.progress * 20)));
          }
        },
      });

      // Bandingkan OCR dari gambar asli yang diperbesar dan gambar yang
      // sudah ditingkatkan kontrasnya. Pilih hasil dengan confidence terbaik.
      const originalResult = await worker.recognize(file);
      setOcrProgress(48);
      const enhancedResult = await worker.recognize(canvas);
      const originalConfidence = originalResult.data.confidence ?? 0;
      const enhancedConfidence = enhancedResult.data.confidence ?? 0;
      const rawText =
        enhancedConfidence >= originalConfidence
          ? enhancedResult.data.text || ""
          : originalResult.data.text || "";

      setOcrProgress(96);
      const lines = rawText
        .split(/\r?\n/)
        .map((line) => line.replace(/[|]/g, "I").replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 1);

      const normalizeAmount = (value: string) => {
        const digits = value.replace(/[^0-9]/g, "");
        const amount = Number(digits);
        return Number.isFinite(amount) && amount >= 100 && amount <= 100_000_000
          ? amount
          : null;
      };

      const amountPattern = /(?:rp\s*\.?\s*)?([0-9][0-9\s.,]{1,})/i;
      const amountCandidates: { amount: number; score: number }[] = [];
      const totalKeyword =
        /grand\s*total|total\s*bayar|total\s*payment|amount\s*paid|net\s*pay|nett|total|jumlah|tagihan|bayar|payment/i;
      const negativeKeyword =
        /subtotal|sub\s*total|tax|ppn|pajak|discount|diskon|change|kembalian|cash|tunai|debit|credit|no\.?\s*transaksi|invoice/i;

      lines.forEach((line, index) => {
        const relevantLines = [line, lines[index + 1] ?? ""].join(" ");
        const matches = [
          ...relevantLines.matchAll(new RegExp(amountPattern.source, "gi")),
        ];
        for (const match of matches) {
          const amount = normalizeAmount(match[1]);
          if (!amount) continue;
          let score = 0;
          if (totalKeyword.test(line)) score += 10;
          if (/grand\s*total|total\s*bayar|amount\s*paid|net\s*pay/i.test(line))
            score += 5;
          if (/rp\s*\.?/i.test(match[0])) score += 2;
          if (negativeKeyword.test(line) && !totalKeyword.test(line))
            score -= 8;
          if (index >= lines.length - 5) score += 1;
          amountCandidates.push({ amount, score });
        }
      });

      // Jika label total tidak terbaca, ambil nominal terbesar dari baris
      // bagian bawah struk sebagai tebakan dengan confidence lebih rendah.
      const rankedAmounts = amountCandidates.sort(
        (a, b) => b.score - a.score || b.amount - a.amount,
      );
      const preferredAmount = rankedAmounts.find((item) => item.score >= 10);
      const fallbackAmount = rankedAmounts
        .filter((item) => item.score > -3)
        .sort((a, b) => b.amount - a.amount)[0];
      const detectedAmount =
        preferredAmount?.amount ?? fallbackAmount?.amount ?? null;

      const dateMatch = rawText.match(
        /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/,
      );
      let detectedDate = toLocalDateOnly(new Date());
      if (dateMatch) {
        const first = Number(dateMatch[1]);
        const second = Number(dateMatch[2]);
        const day = first > 12 ? first : second > 12 ? second : first;
        const month = first > 12 ? second : second > 12 ? first : second;
        let year = dateMatch[3];
        if (year.length === 2) year = `20${year}`;
        const parsed = new Date(Number(year), month - 1, day);
        if (
          parsed.getFullYear() === Number(year) &&
          parsed.getMonth() === month - 1 &&
          parsed.getDate() === day
        ) {
          detectedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }

      const ignoredLine =
        /^(total|subtotal|tax|ppn|cash|change|kembalian|tunai|debit|credit|tanggal|date|time|jam|invoice|receipt|struk|no\.?|telp|phone|customer|cashier|kasir|qty|price|harga|thank|terima kasih)/i;
      const merchantCandidates = lines
        .slice(0, 10)
        .filter(
          (line) =>
            line.length >= 3 &&
            line.length <= 60 &&
            /[a-zA-Z\u00C0-\u024F]{3,}/.test(line) &&
            !ignoredLine.test(line) &&
            !/\d{5,}/.test(line) &&
            !/^(www\.|https?:|\+?\d|[=*#_-]+$)/i.test(line),
        );
      const detectedTitle = merchantCandidates[0];

      setTransactionType("expense");
      setTransactionCategory(
        categories.find((category) => category.type === "expense")?.name ?? "",
      );
      setTransactionTitle(
        detectedTitle?.slice(0, 80) ?? "Pembelian dari struk",
      );
      setTransactionAmount(detectedAmount ? String(detectedAmount) : "");
      setTransactionDate(detectedDate);
      setEditingTransactionId(null);
      setShowTransactionModal(true);
      setOcrProgress(100);

      if (detectedAmount && detectedTitle) {
        notify(
          "Nama toko dan nominal berhasil dibaca. Periksa sebelum menyimpan.",
        );
      } else if (detectedAmount) {
        notify("Nominal terbaca. Periksa nama toko dan data lainnya.");
      } else {
        notify(
          "Teks terbaca, tetapi total belum pasti. Isi nominal secara manual.",
        );
      }
    } catch (error) {
      console.error("Receipt OCR error:", error);
      notify(
        "Gagal membaca gambar. Coba foto yang lebih terang dan tidak buram.",
      );
    } finally {
      if (worker) await worker.terminate();
      setIsReadingReceipt(false);
      setOcrProgress(0);
    }
  };

  const captureReceipt = async () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      notify("Kamera belum siap. Coba beberapa saat lagi.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      notify("Gagal mengambil gambar dari kamera");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          notify("Gagal memproses foto");
          return;
        }
        const file = new File([blob], `receipt-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        void readReceiptImage(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  const handleGalleryImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void readReceiptImage(file);
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

  const getSavingsPocketBalance = (pocketId: string) => {
    return savingsMovements
      .filter((movement) => movement.pocketId === pocketId)
      .reduce((balance, movement) => {
        return movement.type === "deposit"
          ? balance + movement.amount
          : balance - movement.amount;
      }, 0);
  };

  const selectedSavingsPocket = savingsPockets.find(
    (pocket) => pocket.id === selectedSavingsPocketId,
  );

  const selectedPocketMovements = savingsMovements
    .filter((movement) => movement.pocketId === selectedSavingsPocketId)
    .sort(
      (a, b) =>
        new Date(b.movementDate).getTime() - new Date(a.movementDate).getTime(),
    );

  const totalSavingsBalance = savingsPockets.reduce(
    (total, pocket) => total + getSavingsPocketBalance(pocket.id),
    0,
  );

  const totalSavingsDeposits = savingsMovements
    .filter((movement) => movement.type === "deposit")
    .reduce((total, movement) => total + movement.amount, 0);

  const totalSavingsWithdrawals = savingsMovements
    .filter((movement) => movement.type === "withdrawal")
    .reduce((total, movement) => total + movement.amount, 0);

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

                  {accounts.length >= 2 && (
                    <button
                      type="button"
                      className="text-action transfer-text-action"
                      onClick={openTransferModal}
                    >
                      <ArrowDownUp size={14} />
                      Transfer
                      <ChevronRight size={14} />
                    </button>
                  )}
                </>
              ) : (
                <button className="empty-account" onClick={openAddAccount}>
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

            {/* TRANSACTION SHORTCUTS */}
            <section className="transaction-shortcuts">
              <button
                onClick={() => {
                  setTransactionType("expense");
                  setTransactionCategory(
                    categories.find((category) => category.type === "expense")
                      ?.name ?? "",
                  );
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
                  setTransactionCategory(
                    categories.find((category) => category.type === "income")
                      ?.name ?? "",
                  );
                  setShowTransactionModal(true);
                }}
                disabled={!selectedAccount}
              >
                <span className="shortcut-icon income-shortcut">
                  <ArrowDownLeft size={21} />
                </span>
                <span>Income</span>
              </button>

              <button onClick={() => setActiveTab("SavingsPockets")}>
                <span className="shortcut-icon savings-shortcut">
                  <Wallet size={21} />
                </span>
                <span>Savings</span>
              </button>

              <button onClick={() => setActiveTab("Cards")}>
                <span className="shortcut-icon">
                  <CreditCard size={21} />
                </span>
                <span>Cards</span>
              </button>

              <button onClick={() => setActiveTab("Budget")}>
                <span className="shortcut-icon">
                  <ChartPie size={21} />
                </span>
                <span>Budget</span>
              </button>

              <button
                onClick={() =>
                  notify("Fitur Emas akan kita kembangkan berikutnya")
                }
              >
                <span className="shortcut-icon">
                  <Coins size={21} />
                </span>
                <span>Emas</span>
              </button>
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

            <section className="section-block transfer-preview">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MONEY MOVEMENT</p>
                  <h2>Recent transfers</h2>
                  <p className="history-account-name">
                    Perpindahan saldo antar rekening
                  </p>
                </div>

                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    setActivityView("transfers");
                    setTransferAccountFilter("all");
                    setActiveTab("Activity");
                  }}
                >
                  See all <ChevronRight size={15} />
                </button>
              </div>

              {transfers.length > 0 ? (
                <div className="transaction-list">
                  {transfers.slice(0, 3).map((item) => {
                    const fromAccount = accounts.find(
                      (account) => account.id === item.fromAccountId,
                    );

                    const toAccount = accounts.find(
                      (account) => account.id === item.toAccountId,
                    );

                    return (
                      <div
                        className="transaction-item transfer-history-item"
                        key={item.id}
                      >
                        <div className="transaction-icon transfer">
                          <ArrowDownUp size={19} />
                        </div>

                        <div className="transaction-copy">
                          <strong>
                            {item.description || "Transfer antar rekening"}
                          </strong>
                          <span>
                            {fromAccount?.nickname ?? "Rekening asal"}
                            {" → "}
                            {toAccount?.nickname ?? "Rekening tujuan"}
                          </span>
                          <span>{formatDate(item.transferDate)}</span>
                        </div>

                        <strong className="transaction-amount transfer">
                          {rupiah(item.amount)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <ArrowDownUp size={21} />
                  </div>
                  <strong>Belum ada transfer</strong>
                  <span>
                    Riwayat perpindahan saldo antar rekening akan muncul di
                    sini.
                  </span>
                </div>
              )}
            </section>

            <section className="section-block recurring-preview">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">AUTOMATED PLANNING</p>
                  <h2>Recurring transactions</h2>
                  <p className="history-account-name">
                    Jadwal pemasukan dan pengeluaran rutin
                  </p>
                </div>

                <button
                  className="text-action"
                  onClick={openAddRecurring}
                  disabled={accounts.length === 0}
                >
                  <Plus size={15} /> Add schedule
                </button>
              </div>

              {recurringTransactions.length > 0 ? (
                <div className="recurring-list">
                  {recurringTransactions.map((item) => {
                    const account = accounts.find(
                      (entry) => entry.id === item.accountId,
                    );
                    const isDue =
                      item.isActive &&
                      item.nextDueDate <= toLocalDateOnly(new Date());

                    const frequencyLabel = {
                      daily: "Daily",
                      weekly: "Weekly",
                      monthly: "Monthly",
                      yearly: "Yearly",
                    }[item.frequency];

                    return (
                      <div className="recurring-item" key={item.id}>
                        <div className={`recurring-icon ${item.type}`}>
                          <Repeat size={19} />
                        </div>

                        <div className="recurring-copy">
                          <strong>{item.title}</strong>
                          <span>
                            {account?.nickname ?? "Account"} · {item.category}
                          </span>
                          <span>
                            {frequencyLabel}
                            {item.intervalValue > 1
                              ? ` · Every ${item.intervalValue}`
                              : ""}{" "}
                            · {formatDate(item.nextDueDate)}
                          </span>
                          <span
                            className={`recurring-status ${
                              !item.isActive
                                ? "paused"
                                : isDue
                                  ? "due"
                                  : "upcoming"
                            }`}
                          >
                            {!item.isActive
                              ? "Paused"
                              : isDue
                                ? "Due"
                                : "Upcoming"}
                          </span>
                        </div>

                        <div className="recurring-side">
                          <strong className={item.type}>
                            {item.type === "income" ? "+" : "-"}
                            {rupiah(item.amount)}
                          </strong>

                          {isDue && (
                            <button
                              type="button"
                              className="small-action"
                              onClick={() => confirmRecurringTransaction(item)}
                            >
                              Confirm
                            </button>
                          )}

                          <div className="recurring-actions">
                            <button
                              type="button"
                              className="icon-button"
                              title="Edit schedule"
                              onClick={() => openEditRecurring(item)}
                            >
                              <Pencil size={15} />
                            </button>

                            <button
                              type="button"
                              className="icon-button"
                              title={
                                item.isActive
                                  ? "Pause schedule"
                                  : "Activate schedule"
                              }
                              onClick={() => toggleRecurringStatus(item)}
                            >
                              {item.isActive ? "Ⅱ" : "▶"}
                            </button>

                            <button
                              type="button"
                              className="icon-button"
                              title="Delete schedule"
                              onClick={() => deleteRecurringTransaction(item)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <Repeat size={21} />
                  </div>
                  <strong>No recurring schedules</strong>
                  <span>
                    Jadwalkan pembayaran atau pemasukan rutin agar lebih mudah
                    dipantau.
                  </span>
                  <button
                    className="small-action"
                    onClick={openAddRecurring}
                    disabled={accounts.length === 0}
                  >
                    <Plus size={14} /> Create schedule
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "Home" && (
          <section className="section-block recurring-preview">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PAYMENT MANAGEMENT</p>
                <h2>Bill & Payment Reminder</h2>
                <p className="history-account-name">
                  Pantau tagihan dan jadwal pembayaran
                </p>
              </div>

              <button
                className="text-action"
                onClick={openAddBill}
                disabled={accounts.length === 0}
              >
                <Plus size={15} /> Add bill
              </button>
            </div>

            {billReminders.length > 0 ? (
              <div className="recurring-list">
                {billReminders.map((item) => {
                  const account = accounts.find(
                    (entry) => entry.id === item.accountId,
                  );

                  const todayDate = toLocalDateOnly(new Date());
                  const daysUntilDue = Math.ceil(
                    (new Date(`${item.nextDueDate}T00:00:00`).getTime() -
                      new Date(`${todayDate}T00:00:00`).getTime()) /
                      86400000,
                  );

                  const isOverdue = item.isActive && daysUntilDue < 0;
                  const isDueToday = item.isActive && daysUntilDue === 0;
                  const isDue = isOverdue || isDueToday;
                  const isReminder =
                    item.isActive &&
                    daysUntilDue > 0 &&
                    daysUntilDue <= item.reminderDaysBefore;

                  const statusLabel = !item.isActive
                    ? "Completed"
                    : isOverdue
                      ? "Overdue"
                      : isDueToday
                        ? "Due today"
                        : isReminder
                          ? "Upcoming · Reminder"
                          : "Upcoming";

                  const frequencyLabel = {
                    once: "One time",
                    weekly: "Weekly",
                    monthly: "Monthly",
                    yearly: "Yearly",
                  }[item.frequency];

                  return (
                    <div className="recurring-item" key={item.id}>
                      <div className="recurring-icon expense">
                        <CalendarDays size={19} />
                      </div>

                      <div className="recurring-copy">
                        <strong>{item.title}</strong>
                        <span>
                          {account?.nickname ?? "Account"} · {item.category}
                        </span>
                        <span>
                          {frequencyLabel}
                          {item.frequency !== "once" && item.intervalValue > 1
                            ? ` · Every ${item.intervalValue}`
                            : ""}
                          {" · "}
                          {formatDate(item.nextDueDate)}
                        </span>
                        <span
                          className={`recurring-status ${
                            !item.isActive
                              ? "paused"
                              : isOverdue || isDueToday
                                ? "due"
                                : "upcoming"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="recurring-side">
                        <strong className="expense">
                          -{rupiah(item.amount)}
                        </strong>

                        {isDue && (
                          <button
                            type="button"
                            className="small-action"
                            onClick={() => confirmBillPayment(item)}
                            disabled={isConfirmingBill === item.id}
                          >
                            {isConfirmingBill === item.id
                              ? "Processing..."
                              : "Mark as paid"}
                          </button>
                        )}

                        <div className="recurring-actions">
                          <button
                            type="button"
                            className="icon-button"
                            title="Edit bill"
                            onClick={() => openEditBill(item)}
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            className="icon-button delete-action"
                            title="Delete bill"
                            onClick={() => deleteBillReminder(item)}
                            disabled={isDeletingBill === item.id}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-activity">
                <div className="activity-empty-icon">
                  <CalendarDays size={21} />
                </div>
                <strong>No bill reminders yet</strong>
                <span>
                  Tagihan listrik, internet, dan pembayaran rutinmu akan muncul
                  di sini.
                </span>
                <button
                  className="small-action"
                  onClick={openAddBill}
                  disabled={accounts.length === 0}
                >
                  <Plus size={14} /> Add your first bill
                </button>
              </div>
            )}
          </section>
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
                      <div className="account-actions">
                        <button
                          type="button"
                          className="edit-account-button"
                          onClick={() => openEditAccount(account)}
                          aria-label="Edit rekening"
                          title="Edit rekening"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => setAccountToDelete(account)}
                          aria-label="Hapus rekening"
                          title="Hapus rekening"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="primary-button full-button"
              onClick={openAddAccount}
            >
              <Plus size={17} /> Add new account
            </button>
          </div>
        )}

        {activeTab === "Savings" && (
          <div className="page-content secondary-page savings-page">
            <p className="eyebrow">PERSONAL FINANCE</p>
            <h1>Goals</h1>
            <p className="subheading">
              Pantau dan kelola seluruh target tabunganmu.
            </p>

            {/* SAVINGS OVERVIEW */}
            <div className="savings-overview">
              <div className="savings-total-card">
                <span>Total savings</span>
                <strong>
                  {rupiah(
                    savingsGoals.reduce(
                      (total, goal) => total + goal.currentAmount,
                      0,
                    ),
                  )}
                </strong>
                <small>Terkumpul dari {savingsGoals.length} savings goal</small>
              </div>

              <div className="savings-stat-grid">
                <div className="savings-stat-card">
                  <span>Active goals</span>
                  <strong>
                    {
                      savingsGoals.filter(
                        (goal) => goal.currentAmount < goal.targetAmount,
                      ).length
                    }
                  </strong>
                </div>

                <div className="savings-stat-card">
                  <span>Completed</span>
                  <strong>
                    {
                      savingsGoals.filter(
                        (goal) => goal.currentAmount >= goal.targetAmount,
                      ).length
                    }
                  </strong>
                </div>
              </div>
            </div>

            {/* SAVINGS GOALS */}
            <section className="section-block savings-goals-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">FINANCIAL PLANNING</p>
                  <h2>My savings goals</h2>
                </div>

                <button className="text-action" onClick={openAddGoal}>
                  <Plus size={15} /> Add goal
                </button>
              </div>

              {savingsGoals.length > 0 ? (
                <div className="savings-goal-list">
                  {savingsGoals.map((goal) => {
                    const progress =
                      goal.targetAmount > 0
                        ? Math.min(
                            100,
                            (goal.currentAmount / goal.targetAmount) * 100,
                          )
                        : 0;

                    const remaining = Math.max(
                      0,
                      goal.targetAmount - goal.currentAmount,
                    );

                    return (
                      <div
                        className="savings-goal-item"
                        key={goal.id}
                        onClick={() => openSavingsGoalDetail(goal.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openSavingsGoalDetail(goal.id);
                          }
                        }}
                      >
                        <div className="goal-item-heading">
                          <div>
                            <strong>{goal.name}</strong>
                            <span>
                              {goal.targetDate
                                ? `Target ${goal.targetDate}`
                                : "No deadline"}
                            </span>
                          </div>

                          <strong>{progress.toFixed(0)}%</strong>
                        </div>

                        <div className="goal-progress-track">
                          <div
                            className="goal-progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        <div className="goal-item-footer">
                          <span>
                            {rupiah(goal.currentAmount)} /{" "}
                            {rupiah(goal.targetAmount)}
                          </span>

                          <span>
                            {remaining > 0
                              ? `Sisa ${rupiah(remaining)}`
                              : "Target tercapai"}
                          </span>

                          <button
                            className="small-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              openContributionModal(goal.id);
                            }}
                          >
                            <Plus size={14} /> Add Funds
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <Target size={21} />
                  </div>
                  <strong>Belum ada savings goal</strong>
                  <span>Buat target tabungan pertamamu.</span>
                  <button className="small-action" onClick={openAddGoal}>
                    <Plus size={14} /> Create goal
                  </button>
                </div>
              )}
            </section>

            {/* CONTRIBUTION HISTORY */}
            <section className="section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MONEY MOVEMENT</p>
                  <h2>Recent contributions</h2>
                </div>
              </div>

              {goalContributions.length > 0 ? (
                <div className="transaction-list">
                  {goalContributions.slice(0, 5).map((item) => {
                    const goal = savingsGoals.find(
                      (entry) => entry.id === item.goalId,
                    );

                    return (
                      <div className="transaction-item" key={item.id}>
                        <div className="transaction-icon income">
                          <ArrowDownLeft size={19} />
                        </div>

                        <div className="transaction-copy">
                          <strong>{goal?.name || "Savings"}</strong>
                          <span>
                            {item.note || "Contribution"} ·{" "}
                            {formatDate(item.contributedAt)}
                          </span>
                        </div>

                        <div className="contribution-actions">
                          <strong className="transaction-amount income">
                            +{rupiah(item.amount)}
                          </strong>

                          <div className="contribution-action-buttons">
                            <button
                              type="button"
                              className="icon-button"
                              title="Edit contribution"
                              onClick={() => openEditContribution(item)}
                            >
                              <Pencil size={15} />
                            </button>

                            <button
                              type="button"
                              className="icon-button"
                              title="Delete contribution"
                              onClick={() => setContributionToDelete(item)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <Wallet size={21} />
                  </div>
                  <strong>Belum ada contribution</strong>
                  <span>Riwayat setoran tabungan akan muncul di sini.</span>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "SavingsPocketDetail" && selectedSavingsPocket && (
          <section className="page-section">
            <button
              className="text-button"
              onClick={() => setActiveTab("SavingsPockets")}
            >
              ← Back to savings
            </button>

            <div className="section-header">
              <div>
                <p className="eyebrow">SAVINGS POCKET</p>
                <h1>{selectedSavingsPocket.name}</h1>
                {selectedSavingsPocket.description && (
                  <p>{selectedSavingsPocket.description}</p>
                )}
              </div>
            </div>

            <div className="balance-card">
              <p>Available balance</p>
              <h2>
                {rupiah(getSavingsPocketBalance(selectedSavingsPocket.id))}
              </h2>

              <div className="action-row">
                <button
                  className="primary-button"
                  onClick={() => {
                    setSavingsMovementType("deposit");
                    setShowSavingsMovementModal(true);
                  }}
                >
                  + Deposit
                </button>

                <button
                  className="secondary-button"
                  onClick={() => {
                    setSavingsMovementType("withdrawal");
                    setShowSavingsMovementModal(true);
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>

            <div className="section-header">
              <div>
                <p className="eyebrow">ACTIVITY</p>
                <h2>Movement history</h2>
              </div>
              <span>{selectedPocketMovements.length} transactions</span>
            </div>

            {selectedPocketMovements.length === 0 ? (
              <div className="empty-state">
                <h3>No movements yet</h3>
                <p>Your deposits and withdrawals will appear here.</p>
              </div>
            ) : (
              <div className="activity-list">
                {selectedPocketMovements.map((movement) => (
                  <div key={movement.id} className="activity-item">
                    <div className="activity-info">
                      <strong>
                        {movement.type === "deposit" ? "Deposit" : "Withdrawal"}
                      </strong>
                      <span>{movement.note || "Savings movement"}</span>
                      <small>{movement.movementDate}</small>
                    </div>

                    <strong
                      className={
                        movement.type === "deposit"
                          ? "income-text"
                          : "expense-text"
                      }
                    >
                      {movement.type === "deposit" ? "+" : "-"}
                      {rupiah(movement.amount)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "SavingsPockets" && (
          <div className="page-content secondary-page savings-page">
            <p className="eyebrow">PERSONAL FINANCE</p>
            <h1>Savings</h1>
            <p className="subheading">
              Kelola tabunganmu dalam beberapa pocket yang terorganisir.
            </p>

            {/* TOTAL SAVINGS */}
            <div className="savings-overview">
              <div className="savings-total-card">
                <span>Total savings balance</span>
                <strong>{rupiah(totalSavingsBalance)}</strong>
                <small>Across {savingsPockets.length} savings pockets</small>
              </div>

              <div className="savings-stat-grid">
                <div className="savings-stat-card">
                  <span>Total deposits</span>
                  <strong>{rupiah(totalSavingsDeposits)}</strong>
                </div>

                <div className="savings-stat-card">
                  <span>Total withdrawals</span>
                  <strong>{rupiah(totalSavingsWithdrawals)}</strong>
                </div>
              </div>
            </div>

            {/* POCKET LIST */}
            <section className="section-block savings-goals-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">YOUR MONEY</p>
                  <h2>My savings pockets</h2>
                </div>

                <button
                  className="text-action"
                  onClick={() => setShowSavingsPocketModal(true)}
                >
                  <Plus size={15} /> Create pocket
                </button>
              </div>

              {savingsPockets.length > 0 ? (
                <div className="savings-goal-list">
                  {savingsPockets.map((pocket) => {
                    const balance = getSavingsPocketBalance(pocket.id);

                    return (
                      <div
                        className="savings-goal-item"
                        key={pocket.id}
                        onClick={() => {
                          setSelectedSavingsPocketId(pocket.id);
                          setActiveTab("SavingsPocketDetail");
                        }}
                      >
                        <div className="goal-item-heading">
                          <div>
                            <strong>{pocket.name}</strong>
                            <span>
                              {pocket.description || "Personal savings pocket"}
                            </span>
                          </div>

                          <strong>{rupiah(balance)}</strong>
                        </div>

                        <div className="goal-item-footer">
                          <span>
                            {
                              savingsMovements.filter(
                                (movement) => movement.pocketId === pocket.id,
                              ).length
                            }{" "}
                            movements
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <Wallet size={21} />
                  </div>

                  <strong>Belum ada savings pocket</strong>
                  <span>
                    Buat pocket pertama untuk mulai memisahkan tabunganmu.
                  </span>

                  <button
                    className="small-action"
                    onClick={() => setShowSavingsPocketModal(true)}
                  >
                    <Plus size={14} /> Create your first pocket
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "SavingsDetail" &&
          (() => {
            const goal = savingsGoals.find(
              (item) => item.id === selectedSavingsGoalId,
            );

            if (!goal) {
              return (
                <div className="page-content secondary-page">
                  <button
                    className="text-action"
                    onClick={() => setActiveTab("Savings")}
                  >
                    ← Back to Goals
                  </button>
                  <h2>Goal tidak ditemukan</h2>
                </div>
              );
            }

            const progress =
              goal.targetAmount > 0
                ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
                : 0;

            const remaining = Math.max(
              0,
              goal.targetAmount - goal.currentAmount,
            );

            const contributions = goalContributions
              .filter((item) => item.goalId === goal.id)
              .sort(
                (a, b) =>
                  new Date(b.contributedAt).getTime() -
                  new Date(a.contributedAt).getTime(),
              );

            return (
              <div className="page-content secondary-page savings-detail-page">
                <button
                  className="text-action"
                  onClick={() => setActiveTab("Savings")}
                >
                  ← Back to Goals
                </button>

                <p className="eyebrow">SAVINGS / GOAL DETAIL</p>
                <h1>{goal.name}</h1>
                <p className="subheading">Track your savings progress.</p>

                <div className="savings-total-card savings-detail-card">
                  <span>Total collected</span>
                  <strong>{rupiah(goal.currentAmount)}</strong>

                  <div className="goal-progress-track">
                    <div
                      className="goal-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="goal-detail-progress-label">
                    <span>{progress.toFixed(1)}% completed</span>
                    <span>{rupiah(goal.targetAmount)}</span>
                  </div>
                </div>

                <div className="savings-stat-grid">
                  <div className="savings-stat-card">
                    <span>Remaining</span>
                    <strong>{rupiah(remaining)}</strong>
                  </div>

                  <div className="savings-stat-card">
                    <span>Contributions</span>
                    <strong>{contributions.length}</strong>
                  </div>
                </div>

                <div className="savings-detail-actions">
                  <button
                    className="primary-button full-button"
                    onClick={() => openContributionModal(goal.id)}
                  >
                    <Plus size={16} /> Add Funds
                  </button>

                  <button
                    className="text-action"
                    onClick={() => openEditGoal(goal)}
                  >
                    Edit Savings Goal
                  </button>

                  <button
                    className="delete-goal-button"
                    onClick={() => setGoalToDelete(goal)}
                  >
                    Delete Savings Goal
                  </button>
                </div>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">MONEY MOVEMENT</p>
                      <h2>Contribution history</h2>
                    </div>
                  </div>

                  {contributions.length > 0 ? (
                    <div className="transaction-list">
                      {contributions.map((item) => (
                        <div className="transaction-item" key={item.id}>
                          <div className="transaction-icon income">
                            <ArrowDownLeft size={19} />
                          </div>

                          <div className="transaction-copy">
                            <strong>
                              {item.note || "Savings contribution"}
                            </strong>
                            <span>
                              {new Date(item.contributedAt).toLocaleDateString(
                                "id-ID",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </div>

                          <strong className="transaction-amount income">
                            +{rupiah(item.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-activity">
                      <strong>Belum ada setoran</strong>
                      <span>Riwayat setoran akan muncul di sini.</span>
                    </div>
                  )}
                </section>
              </div>
            );
          })()}

        {activeTab === "Budget" && (
          <div className="page-content secondary-page budget-page">
            <p className="eyebrow">FINANCIAL PLANNING</p>
            <h1>Budget</h1>
            <p className="subheading">Manage your monthly spending limits.</p>

            {/* MONTH NAVIGATION */}
            <div className="budget-month-navigation">
              <button
                type="button"
                onClick={() => {
                  const [year, month] = budgetMonth.split("-").map(Number);
                  const date = new Date(year, month - 2, 1);
                  setBudgetMonth(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
                  );
                }}
              >
                ←
              </button>

              <strong>
                {new Date(`${budgetMonthKey}-02T12:00:00`).toLocaleDateString(
                  "id-ID",
                  { month: "long", year: "numeric" },
                )}
              </strong>

              <button
                type="button"
                onClick={() => {
                  const [year, month] = budgetMonth.split("-").map(Number);
                  const date = new Date(year, month, 1);
                  setBudgetMonth(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
                  );
                }}
              >
                →
              </button>
            </div>

            {/* BUDGET OVERVIEW */}
            <div className="budget-overview-card">
              <div className="budget-overview-heading">
                <span>Total monthly budget</span>

                <span className={`budget-status ${overallBudgetStatus}`}>
                  {overallBudgetStatusLabel}
                </span>
              </div>

              <strong>{rupiah(totalMonthlyBudget)}</strong>

              <div className="budget-overview-stats">
                <div>
                  <span>Spent</span>
                  <strong>{rupiah(totalBudgetSpent)}</strong>
                </div>

                <div>
                  <span>Remaining</span>
                  <strong
                    className={
                      totalMonthlyBudget - totalBudgetSpent < 0
                        ? "budget-negative"
                        : ""
                    }
                  >
                    {rupiah(totalMonthlyBudget - totalBudgetSpent)}
                  </strong>
                </div>
              </div>

              <div className="budget-progress-track">
                <div
                  className="budget-progress-fill"
                  style={{
                    width: `${
                      totalMonthlyBudget > 0
                        ? Math.min(100, totalBudgetPercentage)
                        : 0
                    }%`,
                  }}
                />
              </div>

              <span className="budget-overview-caption">
                {totalMonthlyBudget > 0
                  ? `${((totalBudgetSpent / totalMonthlyBudget) * 100).toFixed(1)}% of total budget used`
                  : "Belum ada anggaran untuk bulan ini"}
              </span>

              {totalMonthlyBudget > 0 &&
                totalBudgetSpent > totalMonthlyBudget && (
                  <div className="budget-overview-alert">
                    <strong>Budget Exceeded</strong>
                    <span>
                      Pengeluaran melebihi anggaran sebesar{" "}
                      {rupiah(totalBudgetSpent - totalMonthlyBudget)}.
                    </span>
                  </div>
                )}
            </div>

            {/* BUDGET LIST */}
            <section className="section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SPENDING LIMITS</p>
                  <h2>Category budgets</h2>
                </div>

                <button
                  className="text-action"
                  onClick={() => {
                    setEditingBudgetId(null);
                    setBudgetAccountId("");
                    setBudgetCategoryId("");
                    setBudgetAmount("");
                    setShowBudgetModal(true);
                  }}
                >
                  <Plus size={16} /> Add Budget
                </button>
              </div>

              {budgetOverview.length > 0 ? (
                <div className="budget-list">
                  {budgetOverview.map((budget) => (
                    <div
                      className="budget-item budget-item-clickable"
                      key={budget.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openBudgetDetail(budget.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openBudgetDetail(budget.id);
                        }
                      }}
                    >
                      <div className="budget-item-header">
                        <div>
                          <strong>{budget.categoryName}</strong>
                          <span>{budget.accountName}</span>
                          <span className={`budget-status ${budget.status}`}>
                            {budget.status === "over"
                              ? "Exceeded"
                              : budget.status === "near"
                                ? "Near limit"
                                : "Safe"}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="text-action budget-delete-action"
                          onClick={() => setBudgetToDelete(budget)}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                      </div>

                      <div className="budget-item-amounts">
                        <strong>{rupiah(budget.spent)}</strong>
                        <span>of {rupiah(budget.amount)}</span>
                      </div>

                      <div className="budget-progress-track">
                        <div
                          className={`budget-progress-fill ${
                            budget.percentage >= 100
                              ? "over-budget"
                              : budget.percentage >= 80
                                ? "near-budget"
                                : ""
                          }`}
                          style={{
                            width: `${Math.min(100, budget.percentage)}%`,
                          }}
                        />
                      </div>

                      <div className="budget-item-footer">
                        <span>{budget.percentage.toFixed(1)}% used</span>

                        <strong
                          className={
                            budget.remaining < 0 ? "budget-negative" : ""
                          }
                        >
                          {budget.remaining < 0
                            ? `Over ${rupiah(Math.abs(budget.remaining))}`
                            : `${rupiah(budget.remaining)} left`}
                        </strong>
                      </div>

                      {budget.percentage >= 100 && (
                        <div className="budget-alert">
                          <span>!</span>
                          Budget limit exceeded
                        </div>
                      )}

                      {budget.percentage >= 80 && budget.percentage < 100 && (
                        <div className="budget-warning">
                          Approaching budget limit
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-activity">
                  <div className="activity-empty-icon">
                    <ChartPie size={21} />
                  </div>

                  <strong>No budget yet</strong>

                  <span>
                    Buat anggaran pertamamu untuk mulai mengontrsol pengeluaran
                    bulanan.
                  </span>

                  <button
                    className="small-action"
                    onClick={() => {
                      setEditingBudgetId(null);
                      setBudgetAccountId("");
                      setBudgetCategoryId("");
                      setBudgetAmount("");
                      setShowBudgetModal(true);
                    }}
                  >
                    <Plus size={14} /> Create budget
                  </button>
                </div>
              )}
            </section>

            {/* BUDGET ANALYTICS */}
            <section className="section-block budget-analytics">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SPENDING INSIGHTS</p>
                  <h2>Top Spending Categories</h2>
                </div>
              </div>

              {topSpendingCategory ? (
                <>
                  <div className="budget-top-category">
                    <span>Highest spending</span>
                    <strong>{topSpendingCategory.categoryName}</strong>
                    <strong>{rupiah(topSpendingCategory.spent)}</strong>
                  </div>

                  <div className="budget-analytics-list">
                    {budgetCategoryAnalytics
                      .slice(0, 3)
                      .map((category, index) => {
                        const percentage =
                          totalBudgetSpent > 0
                            ? (category.spent / totalBudgetSpent) * 100
                            : 0;

                        return (
                          <div
                            className="budget-analytics-item"
                            key={category.categoryId}
                          >
                            <div className="budget-analytics-info">
                              <div>
                                <span className="budget-analytics-rank">
                                  0{index + 1}
                                </span>
                                <strong>{category.categoryName}</strong>
                              </div>

                              <strong>{rupiah(category.spent)}</strong>
                            </div>

                            <div className="budget-progress-track">
                              <div
                                className="budget-progress-fill"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>

                            <span className="budget-analytics-percentage">
                              {percentage.toFixed(1)}% of total spending
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="empty-activity">
                  <strong>Belum ada data analitik</strong>
                  <span>
                    Tambahkan budget untuk mulai melihat pola pengeluaran.
                  </span>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "BudgetDetail" &&
          (() => {
            if (!selectedBudget) {
              return (
                <div className="page-content secondary-page">
                  <button
                    className="text-action"
                    onClick={() => setActiveTab("Budget")}
                  >
                    ← Back to Budget
                  </button>
                  <h2>Budget tidak ditemukan</h2>
                </div>
              );
            }

            const progress =
              selectedBudget.amount > 0
                ? Math.min(
                    100,
                    (selectedBudget.spent / selectedBudget.amount) * 100,
                  )
                : 0;

            const budgetTransactions = transactions
              .filter(
                (transaction) =>
                  transaction.type === "expense" &&
                  transaction.accountId === selectedBudget.accountId &&
                  transaction.categoryId === selectedBudget.categoryId &&
                  transaction.date.slice(0, 7) ===
                    selectedBudget.budgetMonth.slice(0, 7),
              )
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime(),
              );

            return (
              <div className="page-content secondary-page budget-detail-page">
                <button
                  className="text-action"
                  onClick={() => setActiveTab("Budget")}
                >
                  ← Back to Budget
                </button>

                <p className="eyebrow">BUDGET / CATEGORY DETAIL</p>
                <h1>{selectedBudget.categoryName}</h1>
                <p className="subheading">{selectedBudget.accountName}</p>

                <div className="savings-total-card savings-detail-card budget-detail-card">
                  <span>Total spent</span>
                  <strong>{rupiah(selectedBudget.spent)}</strong>

                  <div className="goal-progress-track">
                    <div
                      className="goal-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="goal-detail-progress-label">
                    <span>{progress.toFixed(1)}% used</span>
                    <span>{rupiah(selectedBudget.amount)}</span>
                  </div>
                </div>

                <div className="savings-stat-grid">
                  <div className="savings-stat-card">
                    <span>Remaining</span>
                    <strong>{rupiah(selectedBudget.remaining)}</strong>
                  </div>

                  <div className="savings-stat-card">
                    <span>Transactions</span>
                    <strong>{budgetTransactions.length}</strong>
                  </div>
                </div>

                <div className="savings-detail-actions">
                  <button
                    className="text-action"
                    onClick={() => {
                      setEditingBudgetId(selectedBudget.id);
                      setBudgetAccountId(selectedBudget.accountId);
                      setBudgetCategoryId(selectedBudget.categoryId);
                      setBudgetAmount(String(selectedBudget.amount));
                      setShowBudgetModal(true);
                    }}
                  >
                    Edit Budget
                  </button>

                  <button
                    className="delete-goal-button"
                    onClick={() => setBudgetToDelete(selectedBudget)}
                  >
                    Delete Budget
                  </button>
                </div>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">MONEY MOVEMENT</p>
                      <h2>Budget history</h2>
                    </div>
                  </div>

                  {budgetTransactions.length > 0 ? (
                    <div className="transaction-list">
                      {budgetTransactions.map((item) => (
                        <div className="transaction-item" key={item.id}>
                          <div className="transaction-icon expense">
                            <ArrowUpRight size={19} />
                          </div>

                          <div className="transaction-copy">
                            <strong>{item.title}</strong>
                            <span>{formatDate(item.date)}</span>
                          </div>

                          <strong className="transaction-amount expense">
                            -{rupiah(item.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-activity">
                      <strong>Belum ada pengeluaran</strong>
                      <span>
                        Riwayat pengeluaran kategori ini akan muncul di sini.
                      </span>
                    </div>
                  )}
                </section>
              </div>
            );
          })()}

        {activeTab === "Activity" && (
          <div className="page-content secondary-page activity-page">
            <p className="eyebrow">MONEY MOVEMENT</p>
            <h1>Activity</h1>
            <p className="subheading">
              Riwayat transaksi dan perpindahan saldo.
            </p>

            <div className="activity-toolbar">
              <div className="activity-view-switch">
                <button
                  type="button"
                  className={
                    activityView === "transactions" ? "filter-active" : ""
                  }
                  onClick={() => {
                    setActivityView("transactions");
                    setShowActivityFilters(false);
                  }}
                >
                  Transaction
                </button>

                <button
                  type="button"
                  className={
                    activityView === "transfers" ? "filter-active" : ""
                  }
                  onClick={() => {
                    setActivityView("transfers");
                    setShowActivityFilters(false);
                  }}
                >
                  Transfer
                </button>
              </div>
            </div>

            <div className="activity-search-row">
              <div className="activity-search-box">
                <Search size={17} />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(event) => setActivitySearch(event.target.value)}
                  placeholder={
                    activityView === "transactions"
                      ? "Search transactions..."
                      : "Search transfers..."
                  }
                />
                {activitySearch && (
                  <button
                    type="button"
                    onClick={() => setActivitySearch("")}
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <button
                type="button"
                className={`activity-filter-button ${showActivityFilters ? "filter-active" : ""}`}
                onClick={() => setShowActivityFilters((current) => !current)}
                aria-label="Open filters"
                title="Filter"
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>

            {showActivityFilters && (
              <div className="activity-filter-panel">
                <div className="activity-filter-field">
                  <label>Account</label>
                  <select
                    value={
                      activityView === "transactions"
                        ? activityAccountFilter
                        : transferAccountFilter
                    }
                    onChange={(event) => {
                      if (activityView === "transactions") {
                        setActivityAccountFilter(event.target.value);
                      } else {
                        setTransferAccountFilter(event.target.value);
                      }
                    }}
                  >
                    <option value="all">All accounts</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.nickname} · {account.bank}
                      </option>
                    ))}
                  </select>
                </div>

                {activityView === "transactions" && (
                  <div className="activity-filter-field">
                    <label>Type</label>
                    <select
                      value={transactionTypeFilter}
                      onChange={(event) =>
                        setTransactionTypeFilter(
                          event.target.value as "all" | "income" | "expense",
                        )
                      }
                    >
                      <option value="all">All transactions</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  className="activity-reset-filter"
                  onClick={() => {
                    setActivityAccountFilter("all");
                    setTransferAccountFilter("all");
                    setTransactionTypeFilter("all");
                    setActivitySearch("");
                  }}
                >
                  Reset filters
                </button>
              </div>
            )}

            {activityView === "transactions" ? (
              filteredActivityTransactions.length > 0 ? (
                <div className="transaction-list activity-full-list">
                  {filteredActivityTransactions.map((transaction) => {
                    const account = accounts.find(
                      (item) => item.id === transaction.accountId,
                    );

                    return (
                      <div
                        className="transaction-item transaction-clickable"
                        key={transaction.id}
                        onClick={() => openTransactionDetail(transaction)}
                      >
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
                          <span className="activity-account-label">
                            {account?.nickname ?? "Unknown account"}
                          </span>
                        </div>

                        <strong
                          className={`transaction-amount ${transaction.type}`}
                        >
                          {transaction.type === "income" ? "+" : "-"}
                          {rupiah(transaction.amount)}
                        </strong>

                        <div
                          className="transaction-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => openEditTransaction(transaction)}
                            aria-label="Edit transaksi"
                            title="Edit transaksi"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            className="transaction-delete-action"
                            onClick={() => setTransactionToDelete(transaction)}
                            aria-label="Hapus transaksi"
                            title="Hapus transaksi"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="large-empty">
                  <Activity size={30} />
                  <strong>
                    {activitySearch ||
                    activityAccountFilter !== "all" ||
                    transactionTypeFilter !== "all"
                      ? "No matching transactions"
                      : "No transactions yet"}
                  </strong>
                  <span>
                    {activitySearch ||
                    activityAccountFilter !== "all" ||
                    transactionTypeFilter !== "all"
                      ? "Try changing your search or filters."
                      : "Your transaction history will appear here."}
                  </span>

                  {accounts.length > 0 && (
                    <button
                      className="primary-button"
                      onClick={() => setShowTransactionModal(true)}
                    >
                      <Plus size={16} /> Add transaction
                    </button>
                  )}
                </div>
              )
            ) : filteredTransfers.length > 0 ? (
              <div className="transaction-list activity-full-list">
                {filteredTransfers.map((item) => {
                  const fromAccount = accounts.find(
                    (account) => account.id === item.fromAccountId,
                  );

                  const toAccount = accounts.find(
                    (account) => account.id === item.toAccountId,
                  );

                  return (
                    <div
                      className="transaction-item transfer-history-item"
                      key={item.id}
                    >
                      <div className="transaction-icon transfer">
                        <ArrowDownUp size={19} />
                      </div>

                      <div className="transaction-copy">
                        <strong>
                          {item.description || "Transfer antar rekening"}
                        </strong>
                        <span>
                          {fromAccount?.nickname ?? "Rekening asal"}
                          {" → "}
                          {toAccount?.nickname ?? "Rekening tujuan"}
                        </span>
                        <span>{formatDate(item.transferDate)}</span>
                      </div>

                      <strong className="transaction-amount transfer">
                        {rupiah(item.amount)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="large-empty">
                <ArrowDownUp size={30} />
                <strong>
                  {activitySearch || transferAccountFilter !== "all"
                    ? "No matching transfers"
                    : "No transfers yet"}
                </strong>
                <span>Your transfer history will appear here.</span>

                {accounts.length >= 2 && (
                  <button
                    className="primary-button"
                    onClick={openTransferModal}
                  >
                    <ArrowDownUp size={16} /> New transfer
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "Profile" && (
          <div className="page-content secondary-page">
            {showCategoryManager ? (
              <>
                {/* CATEGORY MANAGER HEADER */}
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">PERSONALIZATION</p>
                    <h1>Categories</h1>
                    <p className="subheading">
                      Kelola kategori pemasukan dan pengeluaran.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-action"
                    onClick={openAddCategory}
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>

                <button
                  type="button"
                  className="text-action"
                  onClick={() => setShowCategoryManager(false)}
                >
                  ← Back to Profile
                </button>

                {/* EXPENSE CATEGORIES */}
                <div className="category-group">
                  <p className="eyebrow">EXPENSE</p>

                  {categories
                    .filter((category) => category.type === "expense")
                    .map((category) => (
                      <div className="settings-row" key={category.id}>
                        <span>{category.name}</span>
                        <div className="account-actions">
                          <button
                            type="button"
                            className="edit-account-button"
                            onClick={() => openEditCategory(category)}
                            aria-label={`Edit ${category.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => setCategoryToDelete(category)}
                            aria-label={`Delete ${category.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}

                  {categories.filter((category) => category.type === "expense")
                    .length === 0 && (
                    <p className="subheading">
                      Belum ada kategori pengeluaran.
                    </p>
                  )}
                </div>

                {/* INCOME CATEGORIES */}
                <div className="category-group">
                  <p className="eyebrow">INCOME</p>

                  {categories
                    .filter((category) => category.type === "income")
                    .map((category) => (
                      <div className="settings-row" key={category.id}>
                        <span>{category.name}</span>
                        <div className="account-actions">
                          <button
                            type="button"
                            className="edit-account-button"
                            onClick={() => openEditCategory(category)}
                            aria-label={`Edit ${category.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => setCategoryToDelete(category)}
                            aria-label={`Delete ${category.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}

                  {categories.filter((category) => category.type === "income")
                    .length === 0 && (
                    <p className="subheading">Belum ada kategori pemasukan.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* PROFILE HEADER */}
                <p className="eyebrow">PREFERENCES</p>
                <h1>Profile</h1>
                <p className="subheading">
                  Pengaturan personal VILTURE Finance.
                </p>

                {/* PROFILE IDENTITY */}
                <div className="profile-panel">
                  <div className="profile-avatar">V</div>
                  <div>
                    <strong>Personal workspace</strong>
                    <span>VILTURE Finance</span>
                  </div>
                </div>

                {/* DATA INFORMATION */}
                <div className="settings-row">
                  <span>Data storage</span>
                  <strong>
                    {isCloudReady ? "Supabase Cloud" : "Connecting..."}
                  </strong>
                </div>

                <div className="settings-row">
                  <span>Accounts</span>
                  <strong>{accounts.length}</strong>
                </div>

                <div className="settings-row">
                  <span>Transactions</span>
                  <strong>{transactions.length}</strong>
                </div>

                <div className="settings-row">
                  <span>Categories</span>
                  <strong>{categories.length}</strong>
                </div>

                <div className="settings-row">
                  <span>Cloud sync</span>
                  <strong>
                    {cloudError
                      ? "Error"
                      : isCloudReady
                        ? "Connected"
                        : "Connecting..."}
                  </strong>
                </div>

                {cloudError && <p className="subheading">{cloudError}</p>}

                {/* CATEGORY SETTINGS */}
                <div className="category-group">
                  <p className="eyebrow">PREFERENCES</p>
                  <button
                    type="button"
                    className="primary-button full-button"
                    onClick={() => setShowCategoryManager(true)}
                  >
                    <span>Manage Categories</span>
                    <span>→</span>
                  </button>
                </div>
              </>
            )}
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
            className={activeTab === "Savings" ? "nav-active" : ""}
            onClick={() => handleTab("Savings")}
          >
            <Target size={20} />
            <span>Goals</span>
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
      {showSavingsMovementModal && selectedSavingsPocket && (
        <div className="modal-backdrop" onClick={closeSavingsMovementModal}>
          <div
            className="account-modal savings-movement-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SAVINGS MOVEMENT</p>
                <h2>
                  {savingsMovementType === "deposit" ? "Deposit" : "Withdraw"}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeSavingsMovementModal}
                disabled={isSavingSavingsMovement}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-preview">
              <span>Selected pocket</span>
              <strong>{selectedSavingsPocket.name}</strong>
              <span>
                Available balance:{" "}
                {rupiah(getSavingsPocketBalance(selectedSavingsPocket.id))}
              </span>
            </div>

            <form onSubmit={createSavingsMovement}>
              <label htmlFor="savings-movement-amount">Amount (Rp)</label>

              <input
                id="savings-movement-amount"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={savingsMovementAmount}
                onChange={(event) =>
                  setSavingsMovementAmount(event.target.value)
                }
                placeholder="0"
                required
              />

              <label htmlFor="savings-movement-date">Transaction date</label>

              <input
                id="savings-movement-date"
                type="date"
                value={savingsMovementDate}
                onChange={(event) => setSavingsMovementDate(event.target.value)}
                required
              />

              <label htmlFor="savings-movement-note">Note (optional)</label>

              <textarea
                id="savings-movement-note"
                value={savingsMovementNote}
                onChange={(event) => setSavingsMovementNote(event.target.value)}
                placeholder={
                  savingsMovementType === "deposit"
                    ? "Contoh: Transfer gaji"
                    : "Contoh: Keperluan mendadak"
                }
                rows={3}
                maxLength={120}
              />

              <button
                className="primary-button full-button"
                type="submit"
                disabled={isSavingSavingsMovement}
              >
                {isSavingSavingsMovement
                  ? "Saving transaction..."
                  : savingsMovementType === "deposit"
                    ? "Confirm deposit"
                    : "Confirm withdrawal"}
              </button>
            </form>
          </div>
        </div>
      )}
      {showSavingsPocketModal && (
        <div className="modal-backdrop" onClick={closeSavingsPocketModal}>
          <div
            className="account-modal savings-pocket-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SAVINGS</p>
                <h2>Create pocket</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeSavingsPocketModal}
                disabled={isSavingSavingsPocket}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={createSavingsPocket}>
              <label htmlFor="savings-pocket-name">Pocket name</label>

              <input
                id="savings-pocket-name"
                value={savingsPocketName}
                onChange={(event) => setSavingsPocketName(event.target.value)}
                placeholder="Contoh: Emergency fund"
                maxLength={40}
                required
              />

              <label htmlFor="savings-pocket-description">Description</label>

              <textarea
                id="savings-pocket-description"
                value={savingsPocketDescription}
                onChange={(event) =>
                  setSavingsPocketDescription(event.target.value)
                }
                placeholder="Untuk apa tabungan ini?"
                rows={3}
                maxLength={120}
              />

              <div className="modal-preview">
                <span>New savings pocket</span>
                <strong>
                  {savingsPocketName.trim() || "Your pocket name"}
                </strong>
              </div>

              <button
                className="primary-button full-button"
                type="submit"
                disabled={isSavingSavingsPocket}
              >
                {isSavingSavingsPocket ? "Creating pocket..." : "Create pocket"}
              </button>
            </form>
          </div>
        </div>
      )}
      {showAccountModal && (
        <div className="modal-backdrop" onClick={closeAccountModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {editingAccountId ? "EDIT ACCOUNT" : "NEW ACCOUNT"}
                </p>

                <h2>{editingAccountId ? "Edit account" : "Add account"}</h2>
              </div>
              <button className="icon-button" onClick={closeAccountModal}>
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
                {editingAccountId ? "Save changes" : "Save account"}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* MODAL TAMBAH / EDIT KATEGORI */}
      {showCategoryModal && (
        <div className="modal-backdrop" onClick={closeCategoryModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PERSONALIZATION</p>
                <h2>{editingCategoryId ? "Edit Category" : "New Category"}</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeCategoryModal}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveCategory}>
              <label htmlFor="category-name">Category name</label>
              <input
                id="category-name"
                type="text"
                placeholder="Enter category name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                maxLength={40}
                required
              />

              <label>Category type</label>
              <div className="type-switch">
                <button
                  type="button"
                  className={categoryType === "expense" ? "type-active" : ""}
                  onClick={() => setCategoryType("expense")}
                >
                  Expense
                </button>

                <button
                  type="button"
                  className={categoryType === "income" ? "type-active" : ""}
                  onClick={() => setCategoryType("income")}
                >
                  Income
                </button>
              </div>

              <button type="submit" className="primary-button full-button">
                {editingCategoryId ? "Save Changes" : "Add Category"}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* MODAL KONFIRMASI HAPUS KATEGORI */}
      {categoryToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isDeletingCategory) setCategoryToDelete(null);
          }}
        >
          <div
            className="account-modal delete-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CONFIRMATION</p>
                <h2>Delete Category?</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setCategoryToDelete(null)}
                disabled={isDeletingCategory}
              >
                <X size={18} />
              </button>
            </div>

            <p className="subheading">
              Kamu yakin ingin menghapus kategori{" "}
              <strong>{categoryToDelete.name}</strong>? Riwayat transaksi yang
              sudah menggunakan kategori ini tetap tersimpan.
            </p>

            <div className="account-actions">
              <button
                type="button"
                className="edit-account-button"
                onClick={() => setCategoryToDelete(null)}
                disabled={isDeletingCategory}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-button"
                onClick={deleteCategory}
                disabled={isDeletingCategory}
              >
                {isDeletingCategory ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedTransaction && (
        <div className="modal-backdrop" onClick={closeTransactionDetail}>
          <div
            className="account-modal transaction-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">TRANSACTION DETAILS</p>
                <h2>Transaction detail</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeTransactionDetail}
              >
                <X size={20} />
              </button>
            </div>

            <div className={`detail-amount ${selectedTransaction.type}`}>
              <span>
                {selectedTransaction.type === "income"
                  ? "Money received"
                  : "Money spent"}
              </span>

              <strong>
                {selectedTransaction.type === "income" ? "+" : "-"}
                {rupiah(selectedTransaction.amount)}
              </strong>
            </div>

            <div className="detail-information">
              <div>
                <span>Description</span>
                <strong>{selectedTransaction.title}</strong>
              </div>

              <div>
                <span>Account</span>
                <strong>
                  {accounts.find(
                    (account) => account.id === selectedTransaction.accountId,
                  )?.nickname ?? "Unknown account"}
                </strong>
              </div>

              <div>
                <span>Category</span>
                <strong>{selectedTransaction.category}</strong>
              </div>

              <div>
                <span>Transaction date</span>
                <strong>{formatDate(selectedTransaction.date)}</strong>
              </div>

              <div>
                <span>Transaction type</span>
                <strong>
                  {selectedTransaction.type === "income" ? "Income" : "Expense"}
                </strong>
              </div>

              <div>
                <span>Transaction ID</span>
                <strong className="detail-transaction-id">
                  {selectedTransaction.id}
                </strong>
              </div>
            </div>

            <div className="detail-actions">
              <button
                type="button"
                className="primary-button full-button"
                onClick={() => openEditTransaction(selectedTransaction)}
              >
                <Pencil size={16} />
                Edit transaction
              </button>

              <button
                type="button"
                className="detail-delete-button"
                onClick={() => {
                  setTransactionToDelete(selectedTransaction);
                  closeTransactionDetail();
                }}
              >
                <Trash2 size={16} />
                Delete transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="modal-backdrop" onClick={closeTransferModal}>
          <div
            className="account-modal transfer-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">MONEY MOVEMENT</p>
                <h2>Transfer between accounts</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeTransferModal}
                disabled={isSavingTransfer}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveTransfer}>
              <label htmlFor="transfer-from">From account</label>
              <select
                id="transfer-from"
                value={transferFromId}
                onChange={(event) => {
                  const value = event.target.value;
                  setTransferFromId(value);

                  if (value === transferToId) {
                    setTransferToId(
                      accounts.find((account) => account.id !== value)?.id ??
                        "",
                    );
                  }
                }}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.nickname} · {account.bank}
                  </option>
                ))}
              </select>

              <div className="transfer-balance-info">
                Available balance:{" "}
                <strong>{rupiah(getAccountBalance(transferFromId))}</strong>
              </div>

              <div className="transfer-direction">
                <ArrowDownUp size={20} />
              </div>

              <label htmlFor="transfer-to">To account</label>
              <select
                id="transfer-to"
                value={transferToId}
                onChange={(event) => setTransferToId(event.target.value)}
                required
              >
                {accounts
                  .filter((account) => account.id !== transferFromId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.nickname} · {account.bank}
                    </option>
                  ))}
              </select>

              <label htmlFor="transfer-amount">Transfer amount</label>
              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="transfer-amount"
                  value={transferAmount}
                  onChange={(event) =>
                    setTransferAmount(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="0"
                  inputMode="numeric"
                  required
                />
              </div>

              <label htmlFor="transfer-description">
                Description (optional)
              </label>
              <input
                id="transfer-description"
                value={transferDescription}
                onChange={(event) => setTransferDescription(event.target.value)}
                placeholder="Contoh: Pindah uang tabungan"
              />

              <label htmlFor="transfer-date">Transfer date</label>
              <input
                id="transfer-date"
                type="date"
                value={transferDate}
                onChange={(event) => setTransferDate(event.target.value)}
                required
              />

              <div className="transfer-note">
                <ArrowDownUp size={15} />
                <span>
                  Transfer tidak dihitung sebagai pemasukan atau pengeluaran.
                </span>
              </div>

              <button
                className="primary-button full-button"
                type="submit"
                disabled={isSavingTransfer}
              >
                {isSavingTransfer ? "Processing..." : "Confirm transfer"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showRecurringModal && (
        <div className="modal-backdrop" onClick={closeRecurringModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">RECURRING SETUP</p>
                <h2>{editingRecurringId ? "Edit schedule" : "New schedule"}</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeRecurringModal}
                disabled={isSavingRecurring}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveRecurringTransaction}>
              <div className="transaction-type-switch">
                <button
                  type="button"
                  className={
                    recurringType === "expense" ? "expense-active" : ""
                  }
                  onClick={() => {
                    setRecurringType("expense");
                    setRecurringCategory(
                      categories.find((category) => category.type === "expense")
                        ?.name ?? "",
                    );
                  }}
                >
                  Expense
                </button>

                <button
                  type="button"
                  className={recurringType === "income" ? "income-active" : ""}
                  onClick={() => {
                    setRecurringType("income");
                    setRecurringCategory(
                      categories.find((category) => category.type === "income")
                        ?.name ?? "",
                    );
                  }}
                >
                  Income
                </button>
              </div>

              <label htmlFor="recurring-title">Description</label>
              <input
                id="recurring-title"
                value={recurringTitle}
                onChange={(event) => setRecurringTitle(event.target.value)}
                placeholder="Contoh: Tagihan internet"
                required
              />

              <label htmlFor="recurring-account">Account</label>
              <select
                id="recurring-account"
                value={recurringAccountId}
                onChange={(event) => setRecurringAccountId(event.target.value)}
                required
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.nickname} · {account.bank}
                  </option>
                ))}
              </select>

              <label htmlFor="recurring-category">Category</label>
              <select
                id="recurring-category"
                value={recurringCategory}
                onChange={(event) => setRecurringCategory(event.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories
                  .filter((category) => category.type === recurringType)
                  .map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
              </select>

              <label htmlFor="recurring-amount">Amount</label>
              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="recurring-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={recurringAmount}
                  onChange={(event) => setRecurringAmount(event.target.value)}
                  placeholder="0"
                  required
                />
              </div>

              <label htmlFor="recurring-frequency">Frequency</label>
              <select
                id="recurring-frequency"
                value={recurringFrequency}
                onChange={(event) =>
                  setRecurringFrequency(
                    event.target.value as RecurringTransaction["frequency"],
                  )
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>

              <label htmlFor="recurring-interval">Repeat every</label>
              <input
                id="recurring-interval"
                type="number"
                min="1"
                step="1"
                value={recurringInterval}
                onChange={(event) => setRecurringInterval(event.target.value)}
                required
              />

              <label htmlFor="recurring-start-date">First due date</label>
              <input
                id="recurring-start-date"
                type="date"
                value={recurringStartDate}
                onChange={(event) => setRecurringStartDate(event.target.value)}
                required
              />

              <label htmlFor="recurring-notes">Notes (optional)</label>
              <input
                id="recurring-notes"
                value={recurringNotes}
                onChange={(event) => setRecurringNotes(event.target.value)}
                placeholder="Additional notes"
              />

              <button
                className="primary-button full-button"
                type="submit"
                disabled={isSavingRecurring || accounts.length === 0}
              >
                {isSavingRecurring
                  ? "Saving..."
                  : editingRecurringId
                    ? "Save changes"
                    : "Create schedule"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showBillModal && (
        <div className="modal-backdrop" onClick={closeBillModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">BILL REMINDER</p>
                <h2>
                  {editingBillId ? "Edit bill reminder" : "New bill reminder"}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeBillModal}
                disabled={isSavingBill}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveBillReminder}>
              <label htmlFor="bill-title">Bill name</label>
              <input
                id="bill-title"
                value={billTitle}
                onChange={(event) => setBillTitle(event.target.value)}
                placeholder="Contoh: Internet bulanan"
                required
              />

              <label htmlFor="bill-account">Payment account</label>
              <select
                id="bill-account"
                value={billAccountId}
                onChange={(event) => setBillAccountId(event.target.value)}
                required
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.nickname} · {account.bank}
                  </option>
                ))}
              </select>

              <label htmlFor="bill-category">Category</label>
              <select
                id="bill-category"
                value={billCategory}
                onChange={(event) => setBillCategory(event.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories
                  .filter((category) => category.type === "expense")
                  .map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
              </select>

              <label htmlFor="bill-amount">Amount</label>
              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="bill-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={billAmount}
                  onChange={(event) => setBillAmount(event.target.value)}
                  placeholder="0"
                  required
                />
              </div>

              <label htmlFor="bill-frequency">Billing frequency</label>
              <select
                id="bill-frequency"
                value={billFrequency}
                onChange={(event) =>
                  setBillFrequency(
                    event.target.value as BillReminder["frequency"],
                  )
                }
              >
                <option value="once">One time</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>

              {billFrequency !== "once" && (
                <>
                  <label htmlFor="bill-interval">Repeat every</label>
                  <input
                    id="bill-interval"
                    type="number"
                    min="1"
                    step="1"
                    value={billInterval}
                    onChange={(event) => setBillInterval(event.target.value)}
                    required
                  />
                </>
              )}

              <label htmlFor="bill-due-date">Next due date</label>
              <input
                id="bill-due-date"
                type="date"
                value={billDueDate}
                onChange={(event) => setBillDueDate(event.target.value)}
                required
              />

              <label htmlFor="bill-reminder-days">
                Remind me before (days)
              </label>
              <input
                id="bill-reminder-days"
                type="number"
                min="0"
                max="30"
                value={billReminderDays}
                onChange={(event) => setBillReminderDays(event.target.value)}
                required
              />

              <label htmlFor="bill-notes">Notes (optional)</label>
              <input
                id="bill-notes"
                value={billNotes}
                onChange={(event) => setBillNotes(event.target.value)}
                placeholder="Additional notes"
              />

              <button
                className="primary-button full-button"
                type="submit"
                disabled={isSavingBill || accounts.length === 0}
              >
                {isSavingBill
                  ? "Saving..."
                  : editingBillId
                    ? "Save changes"
                    : "Create reminder"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showTransactionModal && (
        <div className="modal-backdrop" onClick={closeTransactionModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {editingTransactionId ? "EDIT RECORD" : "NEW RECORD"}
                </p>

                <h2>
                  {editingTransactionId
                    ? "Edit transaction"
                    : "Add transaction"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeTransactionModal}
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
                    setTransactionCategory(
                      categories.find((category) => category.type === "expense")
                        ?.name ?? "",
                    );
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
                    setTransactionCategory(
                      categories.find((category) => category.type === "income")
                        ?.name ?? "",
                    );
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
                required
              >
                {transactionCategory &&
                  !categories.some(
                    (category) =>
                      category.name === transactionCategory &&
                      category.type === transactionType,
                  ) && (
                    <option value={transactionCategory}>
                      {transactionCategory} (Archived)
                    </option>
                  )}

                {categories
                  .filter((category) => category.type === transactionType)
                  .map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
              </select>
              {transactionCategory &&
                !categories.some(
                  (category) =>
                    category.name === transactionCategory &&
                    category.type === transactionType,
                ) && (
                  <option value={transactionCategory}>
                    {transactionCategory} (Archived)
                  </option>
                )}
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
              <label htmlFor="transaction-date">Transaction date</label>
              <input
                id="transaction-date"
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.target.value)}
                required
              />
              <button className="primary-button full-button" type="submit">
                {editingTransactionId ? "Save changes" : "Save transaction"}
              </button>
            </form>
          </div>
        </div>
      )}
      {transactionToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isDeletingTransaction) {
              setTransactionToDelete(null);
            }
          }}
        >
          <div
            className="account-modal delete-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DELETE RECORD</p>
                <h2>Delete transaction?</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                disabled={isDeletingTransaction}
                onClick={() => setTransactionToDelete(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="delete-warning-icon">
              <Trash2 size={25} />
            </div>

            <p className="delete-confirm-description">
              Apakah kamu yakin ingin menghapus transaksi ini? Data yang dihapus
              tidak dapat dikembalikan.
            </p>

            <div className="delete-transaction-preview">
              <span>{transactionToDelete.category}</span>
              <strong>{transactionToDelete.title}</strong>
              <b className={transactionToDelete.type}>
                {transactionToDelete.type === "income" ? "+" : "-"}
                {rupiah(transactionToDelete.amount)}
              </b>
            </div>

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-cancel-button"
                disabled={isDeletingTransaction}
                onClick={() => setTransactionToDelete(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                disabled={isDeletingTransaction}
                onClick={deleteTransaction}
              >
                {isDeletingTransaction ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {accountToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isDeletingAccount) {
              setAccountToDelete(null);
            }
          }}
        >
          <div
            className="account-modal delete-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DELETE ACCOUNT</p>
                <h2>Delete account?</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                disabled={isDeletingAccount}
                onClick={() => setAccountToDelete(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="delete-warning-icon">
              <Trash2 size={25} />
            </div>

            <p className="delete-confirm-description">
              Kamu akan menghapus rekening ini beserta seluruh transaksi yang
              terhubung dengannya. Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="delete-transaction-preview">
              <span>
                {accountToDelete.kind} · {accountToDelete.bank}
              </span>
              <strong>{accountToDelete.nickname}</strong>
              <b>{rupiah(getAccountBalance(accountToDelete.id))}</b>
            </div>

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-cancel-button"
                disabled={isDeletingAccount}
                onClick={() => setAccountToDelete(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                disabled={isDeletingAccount}
                onClick={deleteAccount}
              >
                {isDeletingAccount ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {contributionToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isDeletingContribution) {
              setContributionToDelete(null);
            }
          }}
        >
          <div
            className="account-modal delete-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CONFIRMATION</p>
                <h2>Delete contribution?</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setContributionToDelete(null)}
                disabled={isDeletingContribution}
              >
                <X size={20} />
              </button>
            </div>

            <div className="delete-warning-icon">
              <Trash2 size={25} />
            </div>

            <p className="delete-confirm-description">
              Kamu yakin ingin menghapus setoran ini? Saldo Savings Goal akan
              otomatis dikurangi sesuai nominal setoran.
            </p>

            <div className="delete-transaction-preview">
              <span>Contribution</span>
              <strong>
                {contributionToDelete.note || "Savings contribution"}
              </strong>
              <b>{rupiah(contributionToDelete.amount)}</b>
            </div>

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-cancel-button"
                onClick={() => setContributionToDelete(null)}
                disabled={isDeletingContribution}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                onClick={deleteContribution}
                disabled={isDeletingContribution}
              >
                {isDeletingContribution ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {editingContribution && (
        <div className="modal-backdrop" onClick={closeEditContribution}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SAVINGS MANAGEMENT</p>
                <h2>Edit contribution</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeEditContribution}
                disabled={isUpdatingContribution}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveEditedContribution();
              }}
            >
              <label htmlFor="edit-contribution-amount">
                Contribution amount
              </label>

              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="edit-contribution-amount"
                  type="number"
                  min="1"
                  value={editContributionAmount}
                  onChange={(event) =>
                    setEditContributionAmount(event.target.value)
                  }
                  placeholder="0"
                  required
                />
              </div>

              <label htmlFor="edit-contribution-note">Note (optional)</label>

              <input
                id="edit-contribution-note"
                value={editContributionNote}
                onChange={(event) =>
                  setEditContributionNote(event.target.value)
                }
                placeholder="Contoh: Tabungan bulanan"
              />

              <button
                type="submit"
                className="primary-button full-button"
                disabled={isUpdatingContribution}
              >
                {isUpdatingContribution ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}
      {budgetToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isDeletingBudget) {
              setBudgetToDelete(null);
            }
          }}
        >
          <div
            className="account-modal delete-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CONFIRMATION</p>
                <h2>Delete Budget?</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setBudgetToDelete(null)}
                disabled={isDeletingBudget}
              >
                <X size={20} />
              </button>
            </div>

            <div className="delete-warning-icon">
              <Trash2 size={25} />
            </div>

            <p className="delete-confirm-description">
              Apakah kamu yakin ingin menghapus anggaran ini? Tindakan ini tidak
              dapat dibatalkan.
            </p>

            <div className="delete-transaction-preview">
              <span>Budget category</span>
              <strong>
                {categories.find(
                  (item) => item.id === budgetToDelete.categoryId,
                )?.name ?? "Unknown category"}
              </strong>
              <b>{rupiah(budgetToDelete.amount)}</b>
            </div>

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-cancel-button"
                disabled={isDeletingBudget}
                onClick={() => setBudgetToDelete(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                disabled={isDeletingBudget}
                onClick={deleteBudget}
              >
                {isDeletingBudget ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showBudgetModal && (
        <div className="modal-backdrop" onClick={closeBudgetModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">FINANCIAL PLANNING</p>
                <h2>{editingBudgetId ? "Edit Budget" : "Create Budget"}</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeBudgetModal}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveBudget();
              }}
            >
              <label htmlFor="budget-month">Budget month</label>
              <input
                id="budget-month"
                type="month"
                value={budgetMonth.slice(0, 7)}
                onChange={(event) => setBudgetMonth(`${event.target.value}-01`)}
                required
              />

              <label htmlFor="budget-account">Source account</label>
              <select
                id="budget-account"
                value={budgetAccountId}
                onChange={(event) => setBudgetAccountId(event.target.value)}
                required
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bank} · {account.nickname}
                  </option>
                ))}
              </select>

              <label htmlFor="budget-category">Expense category</label>
              <select
                id="budget-category"
                value={budgetCategoryId}
                onChange={(event) => setBudgetCategoryId(event.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories
                  .filter((category) => category.type === "expense")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>

              <label htmlFor="budget-amount">Budget amount (IDR)</label>
              <input
                id="budget-amount"
                type="number"
                min="1"
                placeholder="Example: 1000000"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                required
              />

              <button className="primary-button full-button" type="submit">
                {editingBudgetId ? "Save Changes" : "Create Budget"}
              </button>
            </form>
          </div>
        </div>
      )}
      {showGoalModal && (
        <div className="modal-backdrop" onClick={closeGoalModal}>
          <div
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SAVINGS MANAGEMENT</p>
                <h2>
                  {editingGoalId ? "Edit savings goal" : "Create savings goal"}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeGoalModal}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveGoal}>
              <label htmlFor="goal-name">Goal name</label>
              <input
                id="goal-name"
                value={goalName}
                onChange={(event) => setGoalName(event.target.value)}
                placeholder="Contoh: Emergency Fund"
                required
              />

              <label htmlFor="goal-target">Target amount</label>
              <div className="currency-input">
                <span>Rp</span>
                <input
                  id="goal-target"
                  value={goalTargetAmount}
                  onChange={(event) =>
                    setGoalTargetAmount(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="0"
                  inputMode="numeric"
                  required
                />
              </div>

              <label htmlFor="goal-date">Target date (optional)</label>
              <input
                id="goal-date"
                type="date"
                value={goalTargetDate}
                onChange={(event) => setGoalTargetDate(event.target.value)}
              />

              <button className="primary-button full-button" type="submit">
                {editingGoalId ? "Save Changes" : "Create goal"}
              </button>
            </form>
          </div>
        </div>
      )}
      {goalToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isDeletingGoal) setGoalToDelete(null);
          }}
        >
          <div
            className="account-modal delete-goal-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SAVINGS MANAGEMENT</p>
                <h2>Delete savings goal?</h2>
              </div>

              <button
                className="icon-button"
                disabled={isDeletingGoal}
                onClick={() => setGoalToDelete(null)}
              >
                <X size={20} />
              </button>
            </div>

            <p className="delete-goal-description">
              Kamu yakin ingin menghapus
              <strong> {goalToDelete.name}</strong>? Seluruh riwayat
              contribution pada goal ini juga akan dihapus. Tindakan ini tidak
              dapat dibatalkan.
            </p>

            <div className="delete-goal-summary">
              <span>Total terkumpul</span>
              <strong>{rupiah(goalToDelete.currentAmount)}</strong>
            </div>

            <div className="delete-goal-actions">
              <button
                className="text-action"
                disabled={isDeletingGoal}
                onClick={() => setGoalToDelete(null)}
              >
                Cancel
              </button>

              <button
                className="delete-goal-confirm"
                disabled={isDeletingGoal}
                onClick={deleteSavingsGoal}
              >
                {isDeletingGoal ? "Deleting..." : "Yes, Delete Goal"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showContributionModal && (
        <div className="modal-backdrop" onClick={closeContributionModal}>
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SAVINGS GOAL</p>
                <h2>Add Contribution</h2>
              </div>

              <button
                className="icon-button"
                onClick={closeContributionModal}
                disabled={isSavingContribution}
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-group">
              <label>Goal</label>
              <div className="form-static-value">
                {savingsGoals.find((goal) => goal.id === selectedGoalId)
                  ?.name || "Savings Goal"}
              </div>
            </div>

            <div className="form-group">
              <label>Contribution Amount</label>
              <input
                className="currency-input"
                type="number"
                min="1"
                placeholder="Masukkan nominal"
                value={contributionAmount}
                onChange={(e) => setContributionAmount(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Note (Optional)</label>
              <input
                className="currency-input"
                type="text"
                placeholder="Contoh: Tabungan bulan November"
                value={contributionNote}
                onChange={(e) => setContributionNote(e.target.value)}
              />
            </div>

            <button
              className="primary-button full-button"
              onClick={saveContribution}
              disabled={isSavingContribution}
            >
              {isSavingContribution ? "Saving..." : "Save Contribution"}
            </button>
          </div>
        </div>
      )}
      {showScanCamera && (
        <section
          className="scan-camera-overlay"
          aria-label="Scan receipt camera"
        >
          <video
            ref={cameraVideoRef}
            className="scan-camera-video"
            autoPlay
            playsInline
            muted
          />
          <div className="scan-camera-shade" />
          <header className="scan-camera-header">
            <button
              type="button"
              className="scan-camera-icon"
              onClick={closeScanCamera}
              aria-label="Tutup kamera"
            >
              <X size={22} />
            </button>
            <div className="scan-camera-heading">
              <strong>Scan receipt</strong>
              <span>Posisikan struk di dalam bingkai</span>
            </div>
            <button
              type="button"
              className={`scan-camera-icon ${flashEnabled ? "flash-on" : ""}`}
              onClick={toggleCameraFlash}
              aria-label="Toggle flash"
              title={flashAvailable ? "Flash" : "Flash tidak tersedia"}
            >
              <Zap size={20} />
            </button>
          </header>

          {cameraError ? (
            <div className="scan-camera-error">
              <Camera size={32} />
              <strong>Kamera belum dapat dibuka</strong>
              <p>
                {cameraError} Pastikan izin kamera aktif dan aplikasi dibuka
                melalui HTTPS.
              </p>
              <button
                type="button"
                className="scan-gallery-button"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus size={18} /> Pilih dari galeri
              </button>
            </div>
          ) : (
            <div className="scan-guide-wrap">
              <div className="scan-guide-frame">
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>Pastikan seluruh bagian struk terlihat jelas</p>
            </div>
          )}

          <div className="scan-camera-controls">
            <button
              type="button"
              className="scan-gallery-button"
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImagePlus size={21} />
              <small>Galeri</small>
            </button>
            <button
              type="button"
              className="scan-shutter"
              onClick={captureReceipt}
              disabled={Boolean(cameraError)}
              aria-label="Ambil foto struk"
            >
              <span />
            </button>
            <div className="scan-camera-spacer" />
          </div>
          <input
            ref={galleryInputRef}
            className="scan-hidden-input"
            type="file"
            accept="image/*"
            onChange={handleGalleryImage}
          />
        </section>
      )}
      {isReadingReceipt && (
        <div className="scan-processing-overlay">
          <div className="scan-processing-card">
            <div className="scan-processing-spinner" />
            <strong>Membaca struk...</strong>
            <span>Memproses teks {ocrProgress}%</span>
            <div className="scan-progress-track">
              <i style={{ width: `${ocrProgress}%` }} />
            </div>
            <small>
              Pemrosesan dilakukan di perangkat. Tidak memakai API berbayar.
            </small>
          </div>
        </div>
      )}
      {toast && <div className="toast-message">{toast}</div>}
    </main>
  );
}

export default App;
