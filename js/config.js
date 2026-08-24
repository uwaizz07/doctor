export const clinicConfig = {
  doctorName: "Dr. Arshadha",
  specialty: "General Physician",
  clinicName: "Arshadha Medical Clinic",

  schedule: {
    workingDays: [1, 2, 3, 4, 5, 6],
    startTime: "09:00",
    endTime: "17:00",
    slotDuration: 30,
    breakStart: "13:00",
    breakEnd: "13:30"
  },

  contact: {
    phone: "+91 77083 23744",
    whatsapp: "+917708323744",
    email: "uwaizzz07@gmail.com",
    address: "123 Medical Center Road, City, State 560001",
    mapUrl: "https://maps.google.com/?q=123+Medical+Center+Road"
  },

  clinicHours: [
    { day: "Monday", hours: "9:00 AM – 5:00 PM" },
    { day: "Tuesday", hours: "9:00 AM – 5:00 PM" },
    { day: "Wednesday", hours: "9:00 AM – 5:00 PM" },
    { day: "Thursday", hours: "9:00 AM – 5:00 PM" },
    { day: "Friday", hours: "9:00 AM – 5:00 PM" },
    { day: "Saturday", hours: "9:00 AM – 5:00 PM" },
    { day: "Sunday", hours: "Closed" }
  ],

  payment: {
    currency: "INR",
    symbol: "₹",
    consultationFee: 500,
    onlinePaymentEnabled: true,
    payAtClinicEnabled: true
  },

  social: {
    facebook: "#",
    instagram: "#",
    twitter: "#"
  },

  meta: {
    title: "Dr. Arshadha | Book Your Appointment Online",
    description: "Book your consultation with Dr. Arshadha at Arshadha Medical Clinic. Easy online appointment scheduling for quality healthcare.",
    keywords: "doctor appointment, Dr. Arshadha, clinic booking, healthcare, general physician"
  }
};

export const appointmentStatuses = {
  pending: { label: "Pending", color: "amber", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  confirmed: { label: "Confirmed", color: "blue", bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" },
  completed: { label: "Completed", color: "green", bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  cancelled: { label: "Cancelled", color: "red", bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
  rescheduled: { label: "Rescheduled", color: "purple", bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  no_show: { label: "No Show", color: "gray", bg: "bg-gray-100", text: "text-gray-800", dot: "bg-gray-500" }
};

export const paymentStatuses = {
  not_required: { label: "Not Required", bg: "bg-gray-100", text: "text-gray-800", dot: "bg-gray-500" },
  pending: { label: "Pending", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  paid: { label: "Paid", bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  failed: { label: "Failed", bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
  refunded: { label: "Refunded", bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  pay_at_clinic: { label: "Pay at Clinic", bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" }
};

export const consultationTypes = [
  { id: "in_person", label: "In-Person Visit" },
  { id: "online", label: "Online Consultation" },
  { id: "follow_up", label: "Follow-up Visit" }
];
