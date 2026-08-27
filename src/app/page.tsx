import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 font-sans dark:bg-black">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Todo con un Solo Proveedor</CardTitle>
          <CardDescription>
            Sistema de gestión de contratos para eventos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Andamiaje inicial del proyecto: Next.js, Tailwind CSS y shadcn/ui
            configurados correctamente.
          </p>
        </CardContent>
        <CardFooter>
          <Button>Comenzar</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
