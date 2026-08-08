import { getSupabaseClient } from '../config/supabase.js';
import { monthKey, sum, parseMonthInput, toMonthInput } from './utils.js';

async function supabase() {
  return getSupabaseClient();
}

async function getSessionUser() {
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

function statementPayload(form) {
  const rentAmount = Number(form.rent_amount) || 0;

  return {
    apartment_id: form.apartment_id || null,
    tenant_id: form.tenant_id || null,
    lease_id: form.lease_id || null,
    // A hónap dátum, nem időpont: soha ne küldjünk UTC időbélyeget, mert az
    // időzónától függően az előző napra (és így az előző hónapra) csúszhat.
    billing_month: parseMonthInput(form.billing_month) || parseMonthInput(monthKey()),
    rent_amount: rentAmount,
    total_amount: rentAmount,
    is_paid: form.is_paid === 'true' || form.is_paid === true,
    paid_at: form.paid_at || null,
    payment_method: form.payment_method || null,
    notes: form.notes || null,
  };
}

function utilityBillPayload(form) {
  // A régebbi adatbázisokban ez a mező kötelező. A számla elszámolási
  // hónapját az időszak kezdőnapjából vezetjük le.
  const billingMonth = parseMonthInput(String(form.period_start || '').slice(0, 7))
    || parseMonthInput(monthKey());

  return {
    lease_id: form.lease_id && String(form.lease_id).trim() ? form.lease_id : null,
    apartment_id: form.apartment_id && String(form.apartment_id).trim() ? form.apartment_id : null,
    tenant_id: form.tenant_id && String(form.tenant_id).trim() ? form.tenant_id : null,
    billing_month: billingMonth,
    utility_type: form.utility_type,
    // Csak 'other' típusnál érdemi: a konkrét tétel neve (pl. "MOHU
    // szemétdíj", "Közös költség"). Áram/víz/gáznál mindig üres, hogy az
    // adatbázis oldali egyediségi megkötés ne törjön meg.
    label: form.utility_type === 'other' ? String(form.label || '').trim() : '',
    period_start: form.period_start || null,
    period_end: form.period_end || null,
    total_amount: Number(form.total_amount) || 0,
    received_at: form.received_at || null,
    due_date: form.due_date || null,
    is_paid: form.is_paid === 'true' || form.is_paid === true,
    paid_at: form.paid_at || null,
    payment_method: form.payment_method || null,
    notes: form.notes || null,
  };
}

export async function loadDashboardData(profile) {
  const client = await supabase();
  const currentMonth = monthKey();
  const currentMonthStart = `${currentMonth}-01`;

  if (profile.role === 'admin' || profile.role === 'manager') {
    const [apartmentsRes, leasesRes, paidRes, overdueRes, outstandingRes, tenantsRes] = await Promise.all([
      client.from('apartments').select('id', { count: 'exact', head: true }).eq('is_active', true),
      client.from('leases').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      client.from('monthly_statements').select('id', { count: 'exact', head: true }).eq('is_paid', true).gte('billing_month', currentMonthStart),
      client.from('monthly_statements').select('id', { count: 'exact', head: true }).eq('is_paid', false).lte('billing_month', currentMonthStart),
      client.from('monthly_statements').select('total_amount').eq('is_paid', false),
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'tenant').eq('is_active', true),
    ]);

    const error = apartmentsRes.error || leasesRes.error || paidRes.error || overdueRes.error || outstandingRes.error || tenantsRes.error;
    if (error) throw error;

    const outstanding = (outstandingRes.data || []).reduce((total, item) => total + (Number(item.total_amount) || 0), 0);

    const recentStatementsRes = await client
      .from('monthly_statements')
      .select(`
        id,
        billing_month,
        total_amount,
        is_paid,
        paid_at,
        apartment:apartments(title, address),
        tenant:profiles(full_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentStatementsRes.error) throw recentStatementsRes.error;

    const recentLeasesRes = await client
      .from('leases')
      .select(`
        id,
        start_date,
        end_date,
        status,
        deposit_amount,
        monthly_rent,
        apartment:apartments(title, address),
        tenant:profiles(full_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentLeasesRes.error) throw recentLeasesRes.error;

    return {
      counts: {
        apartments: apartmentsRes.count || 0,
        tenants: tenantsRes.count || 0,
        activeLeases: leasesRes.count || 0,
        paidRent: paidRes.count || 0,
        overdueRent: overdueRes.count || 0,
        outstanding,
      },
      recentStatements: recentStatementsRes.data || [],
      recentLeases: recentLeasesRes.data || [],
    };
  }

  const [leaseRes, statementsRes, utilityBillsRes, notificationsRes, documentsRes] = await Promise.all([
    client
      .from('leases')
      .select(`
        id,
        start_date,
        end_date,
        monthly_rent,
        deposit_amount,
        apartment:apartments(title, address)
      `)
      .eq('tenant_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('monthly_statements')
      .select(`
        id,
        billing_month,
        rent_amount,
        total_amount,
        is_paid,
        paid_at,
        notes,
        apartment:apartments(title, address)
      `)
      .eq('tenant_id', profile.id)
      .order('billing_month', { ascending: false })
      .limit(8),
    client
      .from('utility_bills')
      .select(`
        id,
        utility_type,
        label,
        period_start,
        period_end,
        total_amount,
        is_paid,
        paid_at,
        apartment:apartments(title, address)
      `)
      .eq('tenant_id', profile.id)
      // Csak a nyitott (nem fizetett) tételek számítanak a dashboard
      // kártyáiban és az "Összes fizetendő" összegben, ezért ezeket limit
      // nélkül kérjük le - így egy régebbi dátumú, de még nyitott "Egyéb"
      // tétel sem eshet ki egy sima "utolsó N" mintavételezés miatt.
      .eq('is_paid', false)
      .order('period_start', { ascending: false })
      .limit(50),
    client
      .from('notifications')
      .select('id, title, message, read_at, created_at, sender_id')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5),
    client
      .from('documents')
      .select('id, title, file_name, file_path, mime_type, created_at, size_bytes')
      .eq('tenant_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const error = leaseRes.error || statementsRes.error || utilityBillsRes.error || notificationsRes.error || documentsRes.error;
  if (error) throw error;

  return {
    lease: leaseRes.data || null,
    statements: statementsRes.data || [],
    utilityBills: utilityBillsRes.data || [],
    notifications: notificationsRes.data || [],
    documents: documentsRes.data || [],
  };
}

export async function listApartments() {
  const client = await supabase();
  const { data, error } = await client
    .from('apartments')
    .select('id, title, code, address, monthly_rent, area_sqm, rooms, notes, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveApartment(payload) {
  const client = await supabase();
  const record = {
    title: payload.title,
    code: payload.code || null,
    address: payload.address || null,
    monthly_rent: Number(payload.monthly_rent) || 0,
    area_sqm: Number(payload.area_sqm) || null,
    rooms: Number(payload.rooms) || null,
    notes: payload.notes || null,
    is_active: payload.is_active === 'true' || payload.is_active === true,
  };

  let query = client.from('apartments').upsert(record).select().single();
  if (payload.id) {
    query = client.from('apartments').update(record).eq('id', payload.id).select().single();
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function archiveApartment(id) {
  const client = await supabase();
  const { error } = await client.from('apartments').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function listTenantProfiles() {
  const client = await supabase();
  const [{ data: profiles, error: profilesError }, { data: leases, error: leasesError }, { data: apartments, error: apartmentsError }] = await Promise.all([
    client.from('profiles').select('id, email, full_name, phone, role, apartment_id, is_active, created_at, updated_at').eq('role', 'tenant').order('created_at', { ascending: false }),
    client.from('leases').select('id, tenant_id, apartment_id, start_date, end_date, monthly_rent, status').order('created_at', { ascending: false }),
    client.from('apartments').select('id, title, address'),
  ]);

  const error = profilesError || leasesError || apartmentsError;
  if (error) throw error;

  const apartmentsById = new Map((apartments || []).map((apartment) => [apartment.id, apartment]));
  const leaseByTenant = new Map();

  (leases || []).forEach((lease) => {
    if (!leaseByTenant.has(lease.tenant_id) || lease.status === 'active') {
      leaseByTenant.set(lease.tenant_id, lease);
    }
  });

  return (profiles || []).map((profile) => ({
    ...profile,
    apartment: apartmentsById.get(profile.apartment_id) || null,
    lease: leaseByTenant.get(profile.id) || null,
  }));
}

export async function saveTenantProfile(payload) {
  const client = await supabase();
  const tenantRecord = {
    id: payload.id,
    email: payload.email,
    full_name: payload.full_name,
    phone: payload.phone || null,
    role: 'tenant',
    apartment_id: payload.apartment_id && payload.apartment_id.trim() !== '' ? payload.apartment_id : null,
    is_active: payload.is_active === 'true' || payload.is_active === true,
  };

  if (payload.id) {
    const { data, error } = await client.from('profiles').update(tenantRecord).eq('id', payload.id).select().single();
    if (error) throw error;
    return data;
  }

  if (!payload.email || !payload.password) {
    throw new Error('Új albérlő létrehozásához e-mail és jelszó szükséges.');
  }

  const { data: sessionData } = await client.auth.getSession();

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        full_name: payload.full_name,
        phone: payload.phone || null,
        role: 'tenant',
      },
    },
  });

  if (signUpError) throw signUpError;

  const createdId = signUpData.user?.id;
  if (!createdId) {
    throw new Error('Az albérlő létrehozása nem fejeződött be.');
  }

  const { data, error } = await client.from('profiles').update(tenantRecord).eq('id', createdId).select().single();
  if (error) throw error;

  if (sessionData?.session && signUpData.session?.user?.id === createdId) {
    await client.auth.setSession({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    });
  }
  return data;
}

export async function archiveTenant(id) {
  const client = await supabase();
  const { error } = await client.from('profiles').update({ is_active: false }).eq('id', id).eq('role', 'tenant');
  if (error) throw error;

  const { error: leaseError } = await client.from('leases').update({ status: 'ended', end_date: new Date().toISOString().slice(0, 10) }).eq('tenant_id', id).eq('status', 'active');
  if (leaseError) throw leaseError;
}

export async function listLeases() {
  const client = await supabase();
  const { data, error } = await client
    .from('leases')
    .select(`
      id,
      apartment_id,
      tenant_id,
      start_date,
      end_date,
      monthly_rent,
      deposit_amount,
      status,
      notes,
      apartment:apartments(id, title, address),
      tenant:profiles(id, full_name, email)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveLease(payload) {
  const client = await supabase();
  const record = {
    apartment_id: payload.apartment_id,
    tenant_id: payload.tenant_id,
    start_date: payload.start_date,
    end_date: payload.end_date || null,
    monthly_rent: Number(payload.monthly_rent) || 0,
    deposit_amount: Number(payload.deposit_amount) || 0,
    status: payload.status || 'active',
    notes: payload.notes || null,
  };

  let query = client.from('leases').insert(record).select().single();
  if (payload.id) {
    query = client.from('leases').update(record).eq('id', payload.id).select().single();
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function archiveLease(id) {
  const client = await supabase();
  const { error } = await client.from('leases').update({ status: 'ended', end_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
  if (error) throw error;
}

export async function listStatements({ profile, tenantId = null } = {}) {
  const client = await supabase();
  let query = client
    .from('monthly_statements')
    .select(`
      id,
      lease_id,
      apartment_id,
      tenant_id,
      billing_month,
      rent_amount,
      total_amount,
      is_paid,
      paid_at,
      payment_method,
      notes,
      apartment:apartments(id, title, address),
      tenant:profiles(id, full_name, email),
      lease:leases(id, start_date, end_date)
    `)
    .order('billing_month', { ascending: false });

  if (profile?.role === 'tenant') {
    query = query.eq('tenant_id', profile.id);
  } else if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveStatement(payload) {
  const client = await supabase();
  const computed = statementPayload(payload);
  let query = client.from('monthly_statements').insert(computed).select().single();
  if (payload.id) {
    query = client.from('monthly_statements').update(computed).eq('id', payload.id).select().single();
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function toggleStatementPaid(id, isPaid) {
  const client = await supabase();
  const { data, error } = await client.from('monthly_statements').update({ is_paid: isPaid, paid_at: isPaid ? new Date().toISOString() : null }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function archiveStatement(id) {
  const client = await supabase();
  const { error } = await client.from('monthly_statements').delete().eq('id', id);
  if (error) throw error;
}

export async function listUtilityBills({ profile, tenantId = null, utilityType = null } = {}) {
  const client = await supabase();
  let query = client
    .from('utility_bills')
    .select(`
      id,
      lease_id,
      apartment_id,
      tenant_id,
      utility_type,
      label,
      period_start,
      period_end,
      total_amount,
      received_at,
      due_date,
      is_paid,
      paid_at,
      payment_method,
      notes,
      apartment:apartments(id, title, address),
      tenant:profiles(id, full_name, email),
      lease:leases(id, start_date, end_date)
    `)
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false });

  if (profile?.role === 'tenant') {
    query = query.eq('tenant_id', profile.id);
  } else if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  if (utilityType) {
    query = query.eq('utility_type', utilityType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveUtilityBill(payload) {
  const client = await supabase();
  const computed = utilityBillPayload(payload);
  let query = client.from('utility_bills').insert(computed).select().single();
  if (payload.id) {
    query = client.from('utility_bills').update(computed).eq('id', payload.id).select().single();
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function toggleUtilityBillPaid(id, isPaid) {
  const client = await supabase();
  const { data, error } = await client
    .from('utility_bills')
    .update({ is_paid: isPaid, paid_at: isPaid ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveUtilityBill(id) {
  const client = await supabase();
  const { error } = await client.from('utility_bills').delete().eq('id', id);
  if (error) throw error;
}

export async function listDocuments(profile, tenantId = null) {
  const client = await supabase();
  let query = client
    .from('documents')
    .select(`
      id,
      tenant_id,
      apartment_id,
      lease_id,
      title,
      file_name,
      file_path,
      mime_type,
      size_bytes,
      created_at,
      uploaded_by,
        tenant:profiles!documents_tenant_id_fkey(id, full_name, email),
        uploaded_by_profile:profiles!documents_uploaded_by_fkey(id, full_name, email),
      apartment:apartments(id, title)
    `)
    .order('created_at', { ascending: false });

  if (profile?.role === 'tenant') {
    query = query.eq('tenant_id', profile.id);
  } else if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function uploadDocument({ profile, file, title, tenantId, leaseId, apartmentId }) {
  const client = await supabase();
  const filePath = `${tenantId || profile.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await client.storage.from('documents').upload(filePath, file, {
    upsert: false,
    contentType: file.type || 'application/pdf',
  });
  if (uploadError) throw uploadError;

  const record = {
    tenant_id: tenantId || profile.id,
    lease_id: leaseId || null,
    apartment_id: apartmentId || null,
    title,
    file_name: file.name,
    file_path: filePath,
    mime_type: file.type || 'application/pdf',
    size_bytes: file.size,
    uploaded_by: profile.id,
  };

  const { data, error } = await client.from('documents').insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(id) {
  const client = await supabase();
  const { data: doc, error: fetchError } = await client.from('documents').select('file_path').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;
  if (doc?.file_path) {
    const { error: storageError } = await client.storage.from('documents').remove([doc.file_path]);
    if (storageError) throw storageError;
  }
  const { error } = await client.from('documents').delete().eq('id', id);
  if (error) throw error;
}

export async function getDocumentDownloadUrl(filePath) {
  const client = await supabase();
  const { data, error } = await client.storage.from('documents').createSignedUrl(filePath, 60 * 15);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function listNotifications(profile) {
  const client = await supabase();
  let query = client
    .from('notifications')
    .select(`
      id,
      recipient_id,
      sender_id,
      title,
      message,
      read_at,
      created_at,
      recipient:profiles!notifications_recipient_id_fkey(id, full_name, email),
      sender:profiles!notifications_sender_id_fkey(id, full_name, email)
    `)
    .order('created_at', { ascending: false });

  if (profile?.role === 'tenant') {
    query = query.eq('recipient_id', profile.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function sendNotification({ recipientId, title, message, senderId }) {
  const client = await supabase();
  const { data, error } = await client.from('notifications').insert({
    recipient_id: recipientId,
    sender_id: senderId,
    title,
    message,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function markNotificationRead(id) {
  const client = await supabase();
  const { data, error } = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function getAppSettings() {
  const client = await supabase();
  const { data, error } = await client.from('app_settings').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveAppSettings(payload) {
  const client = await supabase();
  const record = {
    id: payload.id || 1,
    company_name: payload.company_name,
    currency: payload.currency || 'HUF',
    due_day: Number(payload.due_day) || 10,
    contact_email: payload.contact_email || null,
    contact_phone: payload.contact_phone || null,
    payment_note: payload.payment_note || null,
  };
  const { data, error } = await client.from('app_settings').upsert(record).select().single();
  if (error) throw error;
  return data;
}

export function normalizeBillingMonth(value) {
  return toMonthInput(value);
}

export function computeStatementTotals(form) {
  const payload = statementPayload(form);
  return {
    totalAmount: payload.total_amount,
  };
}