import axiosClient from '@/utils/axiosClient'

export const getFanpages = async () => {
  try {
    const response = await axiosClient.get('/fanpages')
    return response.data
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const createFanpage = async (payload: { name?: string; url: string }) => {
  try {
    const response = await axiosClient.post('/fanpages', payload)
    return response.data
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const updateFanpage = async (
  id: string,
  payload: { name?: string; url?: string },
) => {
  try {
    const response = await axiosClient.patch(`/fanpages/${id}`, payload)
    return response.data
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const deleteFanpage = async (id: string) => {
  try {
    const response = await axiosClient.delete(`/fanpages/${id}`)
    return response.data
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const deleteAllFanpages = async () => {
  try {
    const response = await axiosClient.delete('/fanpages')
    return response.data
  } catch (error) {
    console.error(error)
    throw error
  }
}
