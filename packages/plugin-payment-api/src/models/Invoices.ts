import { debugError } from '@erxes/api-utils/src/debuggers';
import { Model } from 'mongoose';

import { IModels } from '../connectionResolver';
import redisUtils from '../redisUtils';
import { makeInvoiceNo } from '../utils';
import {
  IInvoice,
  IInvoiceDocument,
  invoiceSchema
} from './definitions/invoices';
import ErxesPayment from '../api/ErxesPayment';

export interface IInvoiceModel extends Model<IInvoiceDocument> {
  getInvoice(doc: any, leanObject?: boolean): IInvoiceDocument;
  createInvoice(doc: IInvoice & { domain: string }): Promise<IInvoiceDocument>;
  updateInvoice(_id: string, doc: any): Promise<IInvoiceDocument>;
  cancelInvoice(_id: string): Promise<string>;
  checkInvoice(_id: string): Promise<string>;
  removeInvoices(_ids: string[]): Promise<any>;
}

export const loadInvoiceClass = (models: IModels) => {
  class Invoices {
    public static async getInvoice(doc: any, leanObject?: boolean) {
      const invoice = leanObject
        ? await models.Invoices.findOne(doc).lean()
        : await models.Invoices.findOne(doc);

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return invoice;
    }

    public static async createInvoice(doc: IInvoice & { domain: string }) {
      if (!doc.amount && doc.amount === 0) {
        throw new Error('Amount is required');
      }

      if (!doc.selectedPaymentId) {
        throw new Error('Payment config id is required');
      }

      const payment = await models.Payments.getPayment(doc.selectedPaymentId);

      const invoice = await models.Invoices.create({
        ...doc,
        identifier: doc.identifier || makeInvoiceNo(32)
      });

      const api = new ErxesPayment(payment, doc.domain);

      try {
        const apiResponse = await api.createInvoice(invoice);
        invoice.apiResponse = apiResponse;
        invoice.selectedPaymentId = payment._id;
        invoice.paymentKind = payment.kind;

        await invoice.save();

        return invoice;
      } catch (e) {
        await models.Invoices.deleteOne({ _id: invoice._id });

        debugError(
          `Failed to create invoice with type ${invoice.paymentKind}. Error message: ${e.message}`
        );
        throw new Error(e.message);
      }
    }

    public static async updateInvoice(_id: string, doc: any) {
      const invoice = await models.Invoices.getInvoice({ _id });

      if (doc.phone) {
        invoice.phone = doc.phone;
      }

      if (invoice.status !== 'pending') {
        throw new Error('Already settled');
      }

      if (!invoice.selectedPaymentId && !invoice.apiResponse) {
        try {
          const payment = await models.Payments.getPayment(
            doc.selectedPaymentId
          );

          const api = new ErxesPayment(payment, doc.domain);
          invoice.identifier = doc.identifier || makeInvoiceNo(32);

          const apiResponse = await api.createInvoice(invoice);

          await models.Invoices.updateOne(
            { _id },
            {
              $set: {
                apiResponse,
                paymentKind: payment.kind,
                selectedPaymentId: payment._id,
                createdAt: new Date()
              }
            }
          );

          return models.Invoices.getInvoice({ _id });
        } catch (e) {
          throw new Error(e.message);
        }
      }

      if (!invoice.apiResponse) {
        await models.Invoices.updateOne({ _id }, { $set: doc });
        try {
          const payment = await models.Payments.getPayment(
            doc.selectedPaymentId
          );

          const api = new ErxesPayment(payment, doc.domain);
          invoice.identifier = doc.identifier || makeInvoiceNo(32);

          const apiResponse = await api.createInvoice(invoice);

          await models.Invoices.updateOne(
            { _id },
            {
              $set: {
                apiResponse,
                paymentKind: payment.kind,
                selectedPaymentId: payment._id,
                createdAt: new Date()
              }
            }
          );

          return models.Invoices.getInvoice({ _id });
        } catch (e) {
          throw new Error(e.message);
        }
      }

      if (invoice.selectedPaymentId === doc.selectedPaymentId) {
        await models.Invoices.updateOne({ _id }, { $set: doc });

        if (doc.paymentKind === 'storepay') {
          const payment = await models.Payments.getPayment(
            doc.selectedPaymentId
          );
          const apiResponse = await new ErxesPayment(
            payment,
            doc.domain
          ).createInvoice(invoice);

          await models.Invoices.updateOne(
            { _id },
            {
              $set: {
                apiResponse,
                paymentKind: payment.kind,
                selectedPaymentId: payment._id,
                createdAt: new Date()
              }
            }
          );
        }

        return models.Invoices.getInvoice({ _id });
      }

      const prevPayment = await models.Payments.getPayment(
        invoice.selectedPaymentId
      );
      const newPayment = await models.Payments.getPayment(
        doc.selectedPaymentId
      );

      new ErxesPayment(prevPayment).cancelInvoice(invoice);

      try {
        invoice.identifier = doc.identifier || makeInvoiceNo(32);
        const apiResponse = await new ErxesPayment(
          newPayment,
          doc.domain
        ).createInvoice(invoice);

        await models.Invoices.updateOne(
          { _id },
          {
            $set: {
              apiResponse,
              paymentKind: newPayment.kind,
              selectedPaymentId: newPayment._id,
              createdAt: new Date()
            }
          }
        );
      } catch (e) {
        await models.Invoices.deleteOne({ _id: invoice._id });
        throw new Error(e.message);
      }
    }

    public static async cancelInvoice(_id: string) {
      const invoice = await models.Invoices.getInvoice({ _id });

      if (invoice.status !== 'pending') {
        throw new Error('Already settled');
      }

      const payment = await models.Payments.getPayment(
        invoice.selectedPaymentId
      );

      const api = new ErxesPayment(payment);

      api.cancelInvoice(invoice);

      await models.Invoices.deleteOne({ _id });

      redisUtils.removeInvoice(_id);

      return 'success';
    }

    public static async checkInvoice(_id: string) {
      const invoice = await models.Invoices.getInvoice({ _id });

      if (!invoice.selectedPaymentId || !invoice.selectedPaymentId.length) {
        return 'pending';
      }

      const payment = await models.Payments.getPayment(
        invoice.selectedPaymentId
      );

      const api = new ErxesPayment(payment);

      const status = await api.manualCheck(invoice);

      if (status === 'paid') {
        invoice.status = status;
        await invoice.save();
      }

      return status;
    }

    public static async removeInvoices(_ids: string[]) {
      const invoiceIds = await models.Invoices.find({
        _id: { $in: _ids },
        status: { $ne: 'paid' }
      }).distinct('_id');

      await models.Invoices.deleteMany({ _id: { $in: invoiceIds } });

      redisUtils.removeInvoices(_ids);

      return 'removed';
    }
  }
  invoiceSchema.loadClass(Invoices);
  return invoiceSchema;
};
