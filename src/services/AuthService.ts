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

export const refreshSession = async () => {
  const response = await axiosClient.post('/auth/refresh');
  return response.data;
}

export const logoutSession = async () => {
  const response = await axiosClient.post('/auth/logout');
  return response.data;
}

export const getMe = async () => {
  const response = await axiosClient.get('/users/me');
  return response.data;
}

export const updateMe = async (payload: {
  name?: string
  avatarUrl?: string
  birthDate?: string
  gender?: 'male' | 'female' | 'other'
}) => {
  const response = await axiosClient.patch('/users/me', payload)
  return response.data
}
  