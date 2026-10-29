import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go PC90s",
  description: "PC통신 재현 프로젝트",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
