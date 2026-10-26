const PROJECT_ID = 'prj_wiKKHZVT5IYjbyBaFhM29vQxHcao';
const TEAM_ID = 'team_oDLNhA21nkWJrtVTK5Rk5tdu';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) {
    return response.status(503).json({ error: 'Visitor count unavailable' });
  }

  try {
    const query = new URLSearchParams({
      projectId: PROJECT_ID,
      teamId: TEAM_ID,
      filter: "environment eq 'production'"
    });
    const analyticsResponse = await fetch(
      `https://api.vercel.com/v1/query/web-analytics/visits/count?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    );

    if (!analyticsResponse.ok) {
      return response.status(503).json({ error: 'Visitor count unavailable' });
    }

    const payload = await analyticsResponse.json();
    const visitors = Number(payload?.data?.visitors);
    if (!Number.isFinite(visitors) || visitors < 0) {
      return response.status(503).json({ error: 'Visitor count unavailable' });
    }

    const cacheSeconds = visitors === 0 ? 30 : 300;
    response.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`);
    return response.status(200).json({ visitors });
  } catch {
    return response.status(503).json({ error: 'Visitor count unavailable' });
  }
}
