const createError = require("http-errors")

const { Property } = require("../models")
const envConfig = require("../configs/envConfig")
const {
    accommodationTypes: { ENTIRE_HOUSE, SPECIFIC_ROOM },
} = require("../constants")
const {
    pickFields,
    file: { deleteStaticFile, deleteManyStaticFiles },
} = require("../utils")

const createProperty = async (body) => {
    body = pickFields(
        body,
        "title",
        "isClosed",
        "owner",
        "pageName",
        "description",
        "facilityCodes",
        "address",
        "accommodations",
    )
    const property = new Property(body)
    property.score = null
    property.sumScore = 0
    property.reviewCount = 0
    return property.save()
}

/**
 * update Property
 * @param {property} property
 * @param {Object} updateBody
 */
const updateProperty = async (property, updateBody) => {
    updateBody = pickFields(
        updateBody,
        "title",
        "isClosed",
        "pageName",
        "description",
        "facilities",
    )
    Object.assign(property, updateBody)
    return property.save()
}

/**
 * Paginate properties
 * @param {propertyFilter} filter
 * @param {queryOptions} queryOptions
 * @returns {Promise<property[]>}
 */
const paginateProperties = async (filter, queryOptions) => {
    return Property.paginate(filter, queryOptions)
}

/**
 * Check accommodation is available from bookIn date to bookOut date
 * @param {accommodation} accom
 * @param {Date} bookIn
 * @param {Date} bookOut
 * @returns {boolean}
 */
const isAccommodationAvailable = (accom, bookIn, bookOut) => {
    let isAvailable = false
    const cbDates = accom.currentBookingDates

    if (
        cbDates.length === 0 ||
        bookOut < cbDates[0].bookIn ||
        bookIn > cbDates[cbDates.length - 1].bookOut
    ) {
        isAvailable = true
    } else {
        for (let i = 1; i < cbDates.length; i++) {
            if (bookOut < cbDates[i].bookIn) {
                if (bookIn > cbDates[i - 1].bookOut) {
                    isAvailable = true
                }
                break
            }
        }
    }
    return isAvailable
}

/**
 * Check property is available from bookIn date to bookOut date
 * @param {property} property
 * @param {Date} bookIn
 * @param {Date} bookOut
 * @returns {boolean}
 */
const isPropertyAvailable = (property, bookIn, bookOut) => {
    for (let accom of property.accommodations || []) {
        if (isAccommodationAvailable(accom, bookIn, bookOut)) {
            return true
        }
    }
    return false
}

/**
 * @param {property} property
 * @param {Date} bookIn
 * @param {Date} bookOut
 */
const setAvailabilityFields = (property, bookIn, bookOut) => {
    property.isAvailable = false

    for (let accom of property.accommodations || []) {
        // Check if this accommodation is available
        if (isAccommodationAvailable(accom, bookIn, bookOut)) {
            property.isAvailable = true
            accom.isAvailable = true
        } else {
            accom.isAvailable = false
        }
    }
}

const searchProperties = async ({
    districtId,
    provinceId,
    bookIn,
    bookOut,
    page,
    limit,
}) => {
    const query = Property.where({ isClosed: false })
        .lean()
        .select("-images -description -facilities")
        .sort("-score")

    if (districtId) {
        query.where({ "address.district": districtId })
    }
    if (provinceId) {
        query.where({ "address.province": provinceId })
    }

    let properties
    limit = limit || envConfig.DEFAULT_PAGE_LIMIT
    page = page || 1
    let skip = (page - 1) * limit

    if (bookIn && bookOut) {
        // Find available properties
        const cursor = query.cursor()
        properties = []
        for (
            let property = await cursor.next();
            property !== null;
            property = await cursor.next()
        ) {
            if (skip !== 0) {
                if (isPropertyAvailable(property, bookIn, bookOut)) {
                    skip--
                }
                continue
            }
            if (limit !== 0) {
                setAvailabilityFields(property, bookIn, bookOut)
                if (property.isAvailable) {
                    limit--
                    properties.push(property)
                }
            }
            if (limit === 0 && skip === 0) {
                break
            }
        }
    } else {
        query.skip(skip).limit(limit)
        properties = await query.exec()
    }

    return properties
}

/**
 * Get one property
 * @param {{ _id, pageName }} filter
 * @returns {Promise<property>}
 */
const getOneProperty = async (filter) => {
    const query = Property.findOne(filter)

    const property = await query.exec()
    if (!property) {
        throw createError.NotFound("Property not found")
    }

    return property
}

/**
 * Replace thumbnail
 * @param {property} property
 * @param {Object} thumbnailFile
 */
const replaceThumbnail = async (property, thumbnailFile) => {
    const oldThumbnail = property.thumbnail
    property.thumbnail = `/img/${thumbnailFile.filename}`
    await property.save()
    // Delete old file after saving because saving may fail.
    // If we delete first, we may lose the old file
    if (oldThumbnail) {
        deleteStaticFile(oldThumbnail)
    }
    return property.thumbnail
}

/**
 * Add images
 * @param {property} property
 * @param {[]} imageFiles
 */
const addImages = async (property, imageFiles) => {
    if (!imageFiles) {
        throw createError.BadRequest("Images are required")
    }
    const newImages = imageFiles.map((file) => `/img/${file.filename}`)
    property.images.push(...newImages)
    await property.save()
    return newImages
}

/**
 * Delete images
 * @param {property} property
 * @param {number[]} deletedIndexes
 */
const deleteImages = async (property, deletedIndexes) => {
    if (deletedIndexes.length > 100) {
        throw createError.BadRequest("deletedIndexes length excess 100")
    }
    const deletedImgs = []
    property.images = property.images.filter((image, index) => {
        if (deletedIndexes.includes(index)) {
            deletedImgs.push(image)
            return false
        }
        return true
    })
    await property.save()
    await deleteManyStaticFiles(deletedImgs)
    return property.images
}

/**
 * Add new accommodation
 * @param {property} property
 * @param {accommodation} newAccom
 * @returns {Promise<property>}
 */
const addAccommodation = async (property, newAccom) => {
    if (!newAccom) {
        throw createError.BadRequest("Accommodation is required")
    }
    property.accommodations.push(newAccom)
    return property.save()
}

/**
 * Get accommodation by id
 * @param {property} property
 * @param {string} accomId
 * @returns {accommodation}
 */
const getAccommodationById = async (property, accomId) => {
    const accom = property.accommodations.id(accomId)
    if (!accom) {
        throw createError.NotFound("Accommodation not found")
    }
    return accom
}

/**
 * Delete accommodation
 * @param {string} propertyId
 * @param {string} accomId
 */
const deleteAccommodation = async (propertyId, accomId) => {
    await Property.updateOne(
        { _id: propertyId },
        { $pull: { accommodations: { _id: accomId } } },
    )
}

/**
 * Update accommodation
 * @param {property} property
 * @param {accommodation} accom
 * @param {Object} updateBody
 * @returns {Promise<property>}
 */
const updateAccommodation = (property, accom, updateBody) => {
    updateBody = pickFields(
        updateBody,
        "title",
        "pricePerNight",
        "maximumGuest",
        "bed",
        "rooms",
    )
    Object.assign(accom, updateBody)
    return property.save()
}

/**
 * Get property and its accommodation
 * @param {string} propertyId
 * @param {string} accomId
 * @returns {Promise<{ property: property, accom: accommodation}>}
 */
const getPropertyAndAccommodation = async (propertyId, accomId) => {
    const property = await Property.findById(propertyId)
    const accom = property ? property.accommodations.id(accomId) : null
    return { property, accom }
}

/**
 * Add new current booking date to an existing currentBookingDates array
 * @param {Object[]} cBDates
 * @param {Object} newDate
 */
const addCurrentBookingDate = (cBDates, newDate) => {
    cBDates.push(newDate)
    cBDates.sort((a, b) => a.bookIn - b.bookIn)
}

module.exports = {
    createProperty,
    paginateProperties,
    isAccommodationAvailable,
    setAvailabilityFields,
    searchProperties,
    getOneProperty,
    replaceThumbnail,
    addImages,
    deleteImages,
    addAccommodation,
    getAccommodationById,
    deleteAccommodation,
    updateProperty,
    updateAccommodation,
    getPropertyAndAccommodation,
    addCurrentBookingDate,
}

/**
 * @typedef {InstanceType<import('../models/Property')>} property
 *
 * @typedef {Object} accommodation
 * @property {string} title
 * @property {number} pricePerNight
 * @property { 'specific-room' | 'entire-house' } type
 * @property {Object} bed
 * @property {[]} rooms
 * @property {[]} currentBookingDates
 *
 * @typedef {Object} propertyFilter
 * @property {string} title
 * @property {boolean} isClosed
 * @property {string} owner
 * @property {string} pageName
 * @property {number} score
 * @property {string} description
 * @property {[string]} facilities
 * @property {number} reviewCount
 * @property {Object} address
 * @property {string} thumbnail
 * @property {[string]} images
 * @property {[Object]} accommodationGroups
 *
 * @typedef {Object} queryOptions
 * @property {Object} sortBy
 * @property {number} page
 * @property {number} limit
 * @property {string} select
 * @property {string} populate
 * @property {boolean} lean
 */
