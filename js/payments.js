import { supabase } from './supabase.js';

export async function initiateOnlinePayment(appointmentId, amount, currency = 'INR') {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { appointmentId, amount, currency }
    });
    if (error) throw error;
    return { success: true, paymentUrl: data.paymentUrl, paymentId: data.paymentId };
  } catch (e) {
    return { error: 'Payment initialization failed. You can pay at the clinic.' };
  }
}

export async function getPayments(userId = null, appointmentId = null) {
  let query = supabase
    .from('payments')
    .select(`
      *,
      appointment:appointments(appointment_date, appointment_time, status),
      patient:profiles!payments_patient_id_fkey(full_name, email)
    `)
    .order('created_at', { ascending: false });

  if (userId) query = query.eq('patient_id', userId);
  if (appointmentId) query = query.eq('appointment_id', appointmentId);

  const { data, error } = await query;
  if (error) throw new Error('Failed to load payments');
  return data || [];
}

export async function updatePaymentStatus(paymentId, status, providerRef = null) {
  const updateData = { payment_status: status, updated_at: new Date().toISOString() };
  if (providerRef) updateData.provider_reference = providerRef;

  const { error } = await supabase
    .from('payments')
    .update(updateData)
    .eq('id', paymentId);

  if (error) return { error: 'Failed to update payment.' };
  return { success: true };
}

export function formatCurrency(amount, symbol = '₹') {
  return `${symbol}${Number(amount).toLocaleString('en-IN')}`;
}
