import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { getSession } from "@/lib/api/server";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Atkinson_Hyperlegible({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: { default: "Pass Office", template: "%s | Pass Office" },
  description: "Sign in and manage access to your account.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const initialUser =
    session.status === "authenticated"
      ? session.user
      : session.status === "anonymous"
        ? null
        : undefined;

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
      </body>
    </html>
  );
}
