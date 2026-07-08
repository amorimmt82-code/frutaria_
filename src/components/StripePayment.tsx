import React, { useState, useEffect } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { confirmStripePayment } from '../lib/api';

export default function StripePayment({ amount, clientSecret, orderId, onComplete }: { amount: number, clientSecret: string, orderId: string, onComplete: (paymentIntentId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();

  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messageTone, setMessageTone] = useState<'error' | 'success' | 'info'>('info');

  async function syncSuccessfulPayment(paymentIntentId: string) {
    await confirmStripePayment(orderId, paymentIntentId);
    setMessageTone('success');
    setMessage('Pagamento efetuado com sucesso!');
    onComplete(paymentIntentId);
  }

  useEffect(() => {
    if (!stripe || !clientSecret) {
      return;
    }

    stripe.retrievePaymentIntent(clientSecret).then(async ({ paymentIntent }) => {
      switch (paymentIntent?.status) {
        case "succeeded":
          await syncSuccessfulPayment(paymentIntent.id);
          break;
        case "processing":
          setMessageTone('info');
          setMessage("O seu pagamento está a ser processado.");
          break;
        case "requires_payment_method":
          setMessageTone('error');
          setMessage("O seu pagamento não foi bem sucedido, por favor tente novamente.");
          break;
        default:
          setMessageTone('error');
          setMessage("Ocorreu um erro.");
          break;
      }
    });
  }, [clientSecret, stripe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: window.location.origin,
        },
      });

      if (error) {
        setMessageTone('error');
        if (error.type === 'card_error' || error.type === 'validation_error') {
          setMessage(error.message || 'Não foi possível processar o cartão.');
        } else {
          setMessage(error.message || 'Ocorreu um erro inesperado durante o pagamento.');
        }
      } else if (paymentIntent?.status === 'succeeded') {
        await syncSuccessfulPayment(paymentIntent.id);
      } else if (paymentIntent?.status === 'processing') {
        setMessageTone('info');
        setMessage('O seu pagamento está a ser processado.');
      } else if (paymentIntent?.status === 'requires_action') {
        setMessageTone('info');
        setMessage('Confirme o pagamento na janela do seu banco.');
      } else {
        setMessageTone('error');
        setMessage('Não foi possível confirmar o pagamento. Tente novamente ou escolha outro método.');
      }
    } catch (unexpectedError: unknown) {
      setMessageTone('error');
      const message = unexpectedError instanceof Error ? unexpectedError.message : 'Erro inesperado a contactar o sistema de pagamentos.';
      setMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement id="payment-element" options={{ layout: 'tabs' }} />
      <button 
        disabled={isLoading || !stripe || !elements} 
        id="submit"
        className="w-full h-16 bg-gradient-fruit text-white rounded-[32px] font-black text-xl hover:shadow-[0_15px_30px_rgba(255,107,0,0.3)] disabled:opacity-50 transition-all flex items-center justify-center gap-3"
      >
        {isLoading ? (
          <Loader2 className="animate-spin" />
        ) : (
          `Pagar ${amount.toFixed(2)}€`
        )}
      </button>
      {message && <div id="payment-message" className={`text-center text-sm font-bold p-4 rounded-2xl ${messageTone === 'success' ? 'text-emerald-700 bg-emerald-50' : messageTone === 'info' ? 'text-brand-primary bg-brand-primary/5' : 'text-red-500 bg-red-50'}`}>{message}</div>}
    </form>
  );
}
