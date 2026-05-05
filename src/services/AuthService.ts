import axiosClient from "@/utils/axiosClient";


export const loginPassword = async (username: string, password: string) => {
    try {
      const response = await axiosClient.post('/auth/login', { username, password });
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  