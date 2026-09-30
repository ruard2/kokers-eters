export type OrgInfo = {
  organizationId: string | null;
  name: string;
  slug: string;
};

export async function getOrgBySlug(slug: string): Promise<OrgInfo | null> {
  const envSlug = process.env.APP_ORG_SLUG;
  if (envSlug && envSlug.toLowerCase() === slug.toLowerCase()) {
    return {
      organizationId: null,
      name: process.env.APP_ORGANIZATION_NAME || slug,
      slug: envSlug
    };
  }
  return null;
}

export function getAllOrgs(): OrgInfo[] {
  const slug = process.env.APP_ORG_SLUG;
  if (!slug) return [];
  return [
    {
      organizationId: null,
      name: process.env.APP_ORGANIZATION_NAME || slug,
      slug
    }
  ];
}
