import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org-by-slug";
import SignupPage from "@/app/aanmelden/page";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SlugSignupPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();
  return <SignupPage searchParams={searchParams} />;
}
