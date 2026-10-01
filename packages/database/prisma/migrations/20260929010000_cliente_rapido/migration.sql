-- Cliente rápido: cadastro sem telefone para já fazer projetos; os dados são completados depois.
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Customer" ADD COLUMN "isQuick" BOOLEAN NOT NULL DEFAULT false;
