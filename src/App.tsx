import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CreditCard,
  Home,
  Target,
  ChartPie,
  Coins,
  Plus,
  Pencil,
  ScanLine,
  UserRound,
  Wallet,
  X,
  Trash2,
} from "lucide-react";
import "./App.css";
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
  const [budgets, setBudgets] = useState<Budget[]>([]);

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
  const showBalance = true;
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [transactionToDelete, setTransactionToDelete] =
    useState<Transaction | null>(null);

  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState("");
  const swipeStartX = useRef<number | null>(null);
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
        ]);

        if (accountsResult.error) throw accountsResult.error;
        if (transactionsResult.error) throw transactionsResult.error;
        if (categoriesResult.error) throw categoriesResult.error;
        if (savingsGoalsResult.error) throw savingsGoalsResult.error;
        if (contributionsResult.error) throw contributionsResult.error;
        if (budgetsResult.error) throw budgetsResult.error;

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

  const openEditTransaction = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setTransactionTitle(transaction.title);
    setTransactionCategory(transaction.category);
    setTransactionAmount(String(transaction.amount));
    setTransactionType(transaction.type);
    setTransactionDate(toLocalDateOnly(transaction.date));
    setSelectedId(transaction.accountId);
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

              <button onClick={() => setActiveTab("Savings")}>
                <span className="shortcut-icon savings-shortcut">
                  <Wallet size={21} />
                </span>
                <span>Savings</span>
              </button>

              <button onClick={openAddGoal}>
                <span className="shortcut-icon">
                  <Target size={21} />
                </span>
                <span>Goal</span>
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
            <h1>Savings</h1>
            <p className="subheading">Pantau dan kelola seluruh tabunganmu.</p>

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
                    ← Back to Savings
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
                  ← Back to Savings
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

                    <div className="transaction-actions">
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

      {toast && <div className="toast-message">{toast}</div>}
    </main>
  );
}

export default App;
