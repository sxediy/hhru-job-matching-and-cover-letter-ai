import { SupabaseAppProvider } from "@/components/SupabaseAppProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Поиск вакансий hh.ru",
  description: "Фильтры и поиск без LLM (первая итерация)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SupabaseAppProvider>{children}</SupabaseAppProvider>
      </body>
    </html>
  );
}
