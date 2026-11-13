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

        const [accountResult, transactionResult, categoryResult] =
          await Promise.all([
            supabase.from("accounts").select("*").eq("user_id", uid),
            supabase.from("transactions").select("*").eq("user_id", uid),
            supabase.from("categories").select("*").eq("user_id", uid),
          ]);

        if (accountResult.error) throw accountResult.error;
        if (transactionResult.error) throw transactionResult.error;
        if (categoryResult.error) throw categoryResult.error;

        let cloudAccounts = accountResult.data ?? [];
        let cloudTransactions = transactionResult.data ?? [];

        let cloudCategories = categoryResult.data ?? [];

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

    if (!isCloudReady || !userId) {
      notify("Koneksi cloud belum siap. Coba lagi sebentar.");
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

              <button
                onClick={() =>
                  notify("Fitur Goal akan kita kembangkan berikutnya")
                }
              >
                <span className="shortcut-icon">
                  <Target size={21} />
                </span>
                <span>Goal</span>
              </button>

              <button
                onClick={() =>
                  notify("Fitur Budget akan kita kembangkan berikutnya")
                }
              >
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

      {toast && <div className="toast-message">{toast}</div>}
    </main>
  );
}

export default App;
