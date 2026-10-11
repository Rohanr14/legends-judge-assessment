import React, { ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import DynamicGradient from './DynamicGradient';

type LayoutProps = {
  children: ReactNode;
  title?: string;
};

// Navigating away from these timed steps would lose the judge's progress, so the header links are hidden.
const TIMED_PAGES = ['/assessment', '/assessment/ranking', '/upload-notes', '/endorse/session'];

const Layout: React.FC<LayoutProps> = ({ children, title = 'DDN Legends Dance Championship' }) => {
  const router = useRouter();
  // The endorsement application has its own home page, separate from the mock assessment.
  const homePath = router.pathname.startsWith('/endorse') ? '/endorse' : '/';
  const isHomePage = router.pathname === homePath;
  const showNav = !TIMED_PAGES.includes(router.pathname);

  return (
    <div className="min-h-screen flex flex-col relative">
      <DynamicGradient />
      <Head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
      <header className="bg-opacity-80 bg-gray-800 p-4 flex justify-between items-center relative z-10">
        <Link href="https://www.desidancenetwork.org" rel="noopener noreferrer" target="_blank">
          <Image src="/ddn-logo.png" alt="DDN Logo" width={100} height={50}/>
        </Link>
        {showNav && (
          <div className="space-x-4">
            {!isHomePage && (
              <Link href={homePath}>
                <span className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                  Home
                </span>
              </Link>
            )}
            <Link href="/admin/dashboard">
              <span className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
                Admin
              </span>
            </Link>
          </div>
        )}
      </header>
      <main className="container mx-auto p-4 flex-grow relative z-10">
        {children}
      </main>
      <footer className="bg-opacity-80 bg-gray-800 p-4 text-center relative z-10">
        <p>&copy; {new Date().getFullYear()} Desi Dance Network. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Layout;
