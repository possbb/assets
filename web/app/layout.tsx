import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "家财管家｜本地资产与资金管理",
  description: "本地优先的家庭资产、现金流、提醒与证照管理工具。",
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
