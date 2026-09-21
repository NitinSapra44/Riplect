import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  subject: z.string().min(5, "Subject must be at least 5 characters").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(1000),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

export default function Contact() {
  const { toast } = useToast();
  
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      await apiRequest("POST", "/api/contact", data);
    },
    onSuccess: () => {
      form.reset();
      toast({
        title: "Message Sent",
        description: "Thank you for your message. We'll get back to you soon!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <nav className="absolute top-0 w-full z-50 pt-4 pb-2">
        <div className="max-w-7xl mx-auto pl-0 pr-4 sm:pl-0 sm:pr-6 lg:pl-0 lg:pr-8">
          <div className="flex flex-wrap justify-between items-center h-16 gap-4">
            <div className="flex items-center">
              <Link href="/">
                <img 
                  src={riplekLogo1} 
                  alt="Riplect" 
                  className="h-11 cursor-pointer ml-2"
                  data-testid="img-header-logo"
                />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button 
                  variant="ghost" 
                  className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-8 bg-gradient-to-b from-[#FDF6EE]/50 to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#b66667]/3 rounded-full blur-[80px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-stone-600 tracking-tight mb-4" data-testid="text-contact-title">
            Get in Touch
          </h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto" data-testid="text-contact-subtitle">
            We'd love to hear from you. Send us a message and we'll respond as soon as possible.
          </p>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Card className="shadow-lg border-gray-100">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-900" data-testid="text-form-title">Send us a Message</CardTitle>
              <CardDescription data-testid="text-form-description">
                Fill out the form below and we'll get back to you within 24 hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-contact">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Your full name" {...field} data-testid="input-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your@email.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Your phone number" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject *</FormLabel>
                        <FormControl>
                          <Input placeholder="What's this about?" {...field} data-testid="input-subject" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell us more about your inquiry..."
                            rows={6}
                            {...field}
                            data-testid="input-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-[#b66667] hover:bg-[#9e5556] text-white rounded-full"
                    disabled={mutation.isPending}
                    data-testid="button-submit"
                  >
                    {mutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="py-12 border-t border-gray-100 bg-[#FDF6EE]/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <img src={riplekLogo1} alt="Riplect" className="h-8" data-testid="img-footer-logo" />
              <span className="text-sm text-gray-400" data-testid="text-copyright">© 2025</span>
            </div>
            <div className="flex flex-wrap gap-8 text-sm text-gray-500">
              <Link href="/about" className="hover:text-gray-900 transition-colors" data-testid="link-footer-about">About</Link>
              <Link href="/terms-of-service" className="hover:text-gray-900 transition-colors" data-testid="link-footer-terms">Terms</Link>
              <Link href="/privacy-policy" className="hover:text-gray-900 transition-colors" data-testid="link-footer-privacy">Privacy</Link>
              <Link href="/contact" className="hover:text-gray-900 transition-colors" data-testid="link-footer-contact">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
