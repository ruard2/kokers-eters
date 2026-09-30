import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org-by-slug";
import AdminPage from "@/app/admin/page";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SlugAdminPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();
  return <AdminPage searchParams={searchParams} />;
}
