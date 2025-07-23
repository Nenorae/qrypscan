import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Inisialisasi tema ke 'light' secara default untuk render sisi server.
  // Tema sebenarnya dari localStorage akan diatur setelah hidrasi di sisi klien.
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false); // Untuk melacak apakah komponen sudah di-mount di klien

  useEffect(() => {
    // Kode ini hanya berjalan di sisi klien setelah hidrasi.
    setMounted(true);
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      setTheme(storedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // Periksa preferensi sistem jika tidak ada tema yang tersimpan
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    if (!mounted) return; // Hanya terapkan kelas setelah komponen di-mount di klien
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme, mounted]); // Bergantung pada status mounted juga

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);